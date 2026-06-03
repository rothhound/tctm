# Source Integrations — Implementation Reference

Per-source detail. The main spec covers what; this covers how.

## Local development — webhook tunneling

The three webhook sources (Slack, Gmail push, Notion) need a public HTTPS URL that reaches the local API (`localhost:4100`). Use a **Cloudflare named tunnel** for a **fixed** hostname (ngrok-free URLs change on every restart, forcing you to re-paste/re-verify each provider).

- One tunnel, one Published-application route: `tctm-dev.<domain> → http://localhost:4100`.
- That single hostname serves all three webhook paths — set each once, they never change:
  - Slack:  `https://tctm-dev.<domain>/api/webhooks/slack/events`
  - Gmail:  `https://tctm-dev.<domain>/api/webhooks/gmail/push`
  - Notion: `https://tctm-dev.<domain>/api/webhooks/notion`

Per-environment (local vs prod) delivery differs by provider:
- **Gmail** — one Pub/Sub topic, **multiple push subscriptions** → fan-out to local *and* prod simultaneously.
- **Slack** — **one Request URL per app** → use a separate dev Slack app (its own signing secret + bot token), or repoint the URL to the env you're testing.
- **Notion** — add a webhook subscription per environment (or a separate integration).

(Granola has no webhook — it polls outbound, so no tunnel needed.)

## Gmail

### Auth setup (one-time)

Common: enable **Gmail API** + **Cloud Pub/Sub API**, and add scope `gmail.readonly` to the OAuth consent screen. Auth is resolved by `ingestion/gmail/gmail-auth.ts` (`resolveGmailClient`), used by both the ingestion and watch-renewal services. Pick **one** mode:

**(A) Domain-wide delegation — recommended for a shared/functional mailbox** (e.g. `tctm@svangel.com`):
1. Create a **service account** in GCP and generate a JSON key.
2. Workspace admin: Admin console → Security → API controls → **Domain-wide delegation** → add the service account's client ID with scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Set `GMAIL_SERVICE_ACCOUNT_KEY` = the service-account JSON (raw, or base64 for config vars) and `GMAIL_IMPERSONATE_SUBJECT` = the mailbox to read as.
- No interactive consent, no refresh token to manage, admin-controlled, survives credential changes. `userId:'me'` resolves to the impersonated mailbox.

**(B) OAuth refresh token — single-user fallback:**
1. Reuse the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` web client (same as Sign-In).
2. Obtain a refresh token (signed in **as the target mailbox**) with `access_type=offline` + `prompt=consent` — e.g. the Google OAuth 2.0 Playground or a small script.
3. Set `GMAIL_REFRESH_TOKEN`.
- Simpler, but tied to one account's consent and breaks on password/2FA changes — fine for a personal mailbox, fragile for a shared one.

### Pub/Sub setup

```bash
# Create topic
gcloud pubsub topics create gmail-push --project=<project>

# Grant Gmail permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-push \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=<project>

# Create push subscription
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint=https://<domain>/api/webhooks/gmail/push \
  --push-auth-service-account=<service-account>@<project>.iam.gserviceaccount.com \
  --ack-deadline=60 \
  --project=<project>
```

### Watch lifecycle

Gmail requires a `users.watch` call to start delivering events. The watch expires every 7 days and must be renewed.

```ts
// Run daily at 03:00 UTC via BullMQ repeatable job
@Cron('0 3 * * *')
async renewGmailWatch() {
  const auth = await this.getAuthClient(); // OAuth client with refresh token
  const gmail = google.gmail({ version: 'v1', auth });

  const result = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: this.config.get('GMAIL_PUBSUB_TOPIC'),
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    },
  });

  await this.db.update(gmailWatchState).set({
    historyId: result.data.historyId!,
    watchExpiresAt: new Date(Number(result.data.expiration!)),
    lastSyncedAt: new Date(),
  });
}
```

Filter to INBOX only — we explicitly do not want Promotions, Updates, Social, Forums.

### Push webhook handler

```ts
@Post('webhooks/gmail/push')
async handlePush(@Req() req: FastifyRequest, @Body() body: any) {
  // 1. Verify JWT in Authorization header
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = await this.verifyGoogleIdToken(token);
  if (decoded.aud !== this.expectedAudience) throw new UnauthorizedException();

  // 2. Decode Pub/Sub message
  const data = JSON.parse(
    Buffer.from(body.message.data, 'base64').toString('utf-8')
  );
  // data = { emailAddress: 'partner@firm.com', historyId: '12345' }

  // 3. Sync history (async, ack immediately)
  setImmediate(() => this.gmailService.syncFromHistory(data.historyId));

  return { ok: true };
}
```

### History sync

```ts
async syncFromHistory(newHistoryId: string) {
  const state = await this.db.select().from(gmailWatchState).limit(1);
  const startHistoryId = state[0].historyId;

  try {
    const history = await this.gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
    });

    for (const record of history.data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        await this.processMessage(added.message!.id!);
      }
    }

    await this.db.update(gmailWatchState).set({ historyId: newHistoryId });
  } catch (err) {
    if (err.code === 404) {
      // History too old; do a 24h fallback sync
      await this.fullSync24h();
    } else {
      throw err;
    }
  }
}
```

### Message processing

```ts
async processMessage(messageId: string) {
  const msg = await this.gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  // Skip if it's a draft, sent item, or trash
  const labels = msg.data.labelIds ?? [];
  if (labels.includes('DRAFT') || labels.includes('SENT') || labels.includes('TRASH')) return;

  // Skip if from auto-sender domain
  const from = this.extractHeader(msg.data, 'From');
  if (this.isAutoSenderDomain(from)) return;

  // Build signal
  const authorEmail = this.parseEmail(from);
  const isKnownEntity = await this.entitiesService.resolveByEmail(authorEmail);
  const subSource = isKnownEntity ? 'gmail_vip' : 'gmail_cold';

  const body = this.extractTextBody(msg.data); // strips HTML, signatures, quotes

  await this.signals.insert({
    source: 'gmail',
    subSource,
    externalId: msg.data.id!,
    dedupKey: `gmail:${msg.data.id}`,
    payload: {
      title: this.extractHeader(msg.data, 'Subject') ?? '(no subject)',
      body,
      author: { name: this.parseName(from), email: authorEmail },
      url: `https://mail.google.com/mail/u/0/#inbox/${msg.data.id}`,
      threadId: msg.data.threadId!,
      occurredAt: new Date(Number(msg.data.internalDate!)).toISOString(),
      raw: msg.data,
    },
  });
}
```

### Auto-sender filter

Skip if From domain matches known auto-sender list:

```
noreply@*, no-reply@*, donotreply@*
*.calendar-notification.google.com
*.notifications.linkedin.com
*.notifications.github.com
... (curated list, ~100 patterns)
```

This is the highest-leverage filter. 30-40% of inbound email is automated and never contains tasks. Filtering at ingestion saves 30-40% of LLM costs.

---

## Slack

### App configuration

In api.slack.com, create the app. The bot must be **invited as a member** of every channel it should read — channel selection is human, not algorithmic.

Required bot-token scopes:

| Scope | Why |
|-------|-----|
| `app_mentions:read` | Receive `app_mention` (the `@tctm` capture trigger) |
| `channels:history` | Read public-channel messages + context windows |
| `groups:history` | Read private-channel messages + context windows |
| `channels:read` / `groups:read` | Resolve channel IDs to names |
| `reactions:read` | Detect the 🎯 capture reaction |
| `users:read` | Resolve user IDs to names |
| `users:read.email` | Resolve user IDs to emails (for entity matching) |

Event subscriptions:

| Event | Why |
|-------|-----|
| `app_mention` | `@tctm` explicit capture (partner-only) |
| `reaction_added` | 🎯 explicit capture (partner-only) |
| `message.channels` | Passive capture in public channels (anchored on the partner) |
| `message.groups` | Passive capture in private channels (anchored on the partner) |

> **`message.im` is intentionally NOT subscribed.** DMs to the bot are out of scope, and a bot token cannot read the partner's own 1:1 DMs (that needs a user token). See the capture model below.

Request URL: `https://<domain>/api/webhooks/slack/events`  (note the `/api` global prefix)

### Signature verification

Slack's HMAC scheme uses the raw body. Fastify must preserve it.

```ts
// main.ts
adapter.getInstance().addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body, done) => {
    (req as any).rawBody = body;
    done(null, JSON.parse(body as string));
  },
);
```

Then in the controller:

```ts
const baseString = `v0:${timestamp}:${rawBody}`;
const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  throw new UnauthorizedException();
}
```

`timingSafeEqual` matters — string comparison leaks timing information.

### Capture model

`SlackIngestionService.toSignal` routes by event type into **three capture paths** (all require the bot to be a channel member):

| Path | Event | Who | Routing |
|------|-------|-----|---------|
| **@tctm mention** | `app_mention` | **partner only** (`PARTNER_SLACK_USER_ID`) | explicit → `slack_capture` → **bypasses the judge** → inbox |
| **🎯 reaction** | `reaction_added` (`SLACK_TASK_REACTION`, default `dart`) | **partner only** | explicit → `slack_reaction` → **bypasses the judge** → inbox |
| **Passive** | `message.channels` / `message.groups` | **anyone except the partner** | anchored → `slack_channel` → normal extractor → judge → thresholds |

**Anchoring (passive path only).** A passive channel message is captured only when it references the partner — otherwise channel noise is overwhelming. A message anchors when any of:
- it `@`-tags the partner (`<@PARTNER_SLACK_USER_ID>`), OR
- its text names the partner — `PARTNER_NAME` or any `PARTNER_ALIASES` entry (env-driven, comma-separated, case-insensitive, word-boundary matched), OR
- it lands in a thread the partner has posted in (`conversations.replies` contains the partner).

The partner's **own** messages are never captured passively (`event.user === PARTNER_SLACK_USER_ID` is dropped).

**Context window — every path.** A capture never extracts from a lone fragment: a "LOL" or "👍" carries the real ask in the lines before it ("Could you help with this, Jane?" — often without an @tag). `buildWindowBody` assembles a chronological `<author>: <text>` transcript of the surroundings — the **whole thread** (`conversations.replies`) when threaded, otherwise the **last `CONTEXT_WINDOW` (10) messages** up to and including the trigger (`conversations.history`) — and that transcript is the signal body the extractor sees.

**Why the judge bypass.** Explicit captures (`slack_capture`, `slack_reaction`) are the partner's deliberate gesture — their intent *is* the QC. `EXPLICIT_SLACK_SUBSOURCES` in `extraction.processor.ts` skips both the skip-below gate and the adversarial judge and forces `inbox` + `autoCreated`. Passive `slack_channel` runs the full pipeline with conservative thresholds.

### Rate limits

Slack rate-limits per-method, mostly Tier 3 (50+ RPM). Every capture now fans out to a few read calls, so caching matters:

- `users.info` / `conversations.info`: cached in-memory per process (1h Redis TTL planned for production)
- `conversations.history`: called per capture to build the context window (limit 10) and to fetch a reacted message (limit 1)
- `conversations.replies`: called for threaded captures and to test the thread anchor

For startup, prefer `users.list` once and cache the result rather than per-message lookups. Move to a Redis-backed cache for production.

---

## Notion

### Integration setup

1. Create internal integration at notion.so/profile/integrations
2. Capabilities: Read content, Read user information
3. Webhook subscription URL: `https://<domain>/api/webhooks/notion`  ← note the `/api` global prefix
4. Subscribe to events: `page.created`, `page.content_updated`, `page.properties_updated`, `comment.created` (these are the ones `notion.service.ts` handles)
5. Share the relevant databases/pages with the integration (in Notion UI)

### Credentials — where to get each

| Value (env var) | Where in Notion to get it |
|---|---|
| `NOTION_VERIFICATION_TOKEN` | notion.so/profile/integrations → your integration → **Webhooks** → create a subscription pointing at `https://<domain>/api/webhooks/notion`. Notion sends a one-time `{ "verification_token": "…" }` POST to that endpoint (grab it from the server logs) and you paste it back to confirm. This same token signs every later event via the `Notion-Signature` HMAC. **This is the only Notion credential the runtime uses today.** |
| `PARTNER_NOTION_USER_ID` | The partner's Notion user ID (a UUID). Easiest: with the Internal Integration Secret below, call `GET https://api.notion.com/v1/users` (header `Notion-Version: 2022-06-28`) and copy the partner's `id`. |
| Internal Integration Secret (`ntn_…`) | notion.so/profile/integrations → your integration → **Configuration** → *Internal Integration Secret* (Show → Copy). **Not read by the runtime yet** (see CLAUDE.md → Pending Work: full-content fetch) — but you need it now to look up the user ID above, and later for fetching full page/block content. |

### Signature verification

```ts
const signature = req.headers['notion-signature'] as string;
const timestamp = req.headers['notion-request-timestamp'] as string;
const baseString = `${timestamp}.${rawBody}`;
const expected = createHmac('sha256', verificationToken).update(baseString).digest('hex');
if (!timingSafeEqual(Buffer.from(`v0=${expected}`), Buffer.from(signature))) {
  throw new UnauthorizedException();
}
```

### Mention detection

> ✅ **Implemented.** Notion webhooks carry only ids/metadata (`entity.id`, `data.page_id`), so `notion.service.ts`
> fetches the real content from the REST API using `NOTION_API_KEY` (Internal Integration Secret, **Read content**
> + **Read comments** capabilities): `comment.created` → `GET /v1/comments?block_id=…` (match `entity.id`);
> `page.*` → `GET /v1/pages/:id` + `GET /v1/blocks/:id/children`. It then scans properties + body blocks for the
> partner's @mention/assignment. Nested blocks aren't recursed yet; pages are captured only when you're
> mentioned/assigned.

Notion webhooks deliver event metadata, not full content. After receiving, fetch the page:

```ts
const page = await notion.pages.retrieve({ page_id: event.entity.id });
const blocks = await notion.blocks.children.list({ block_id: event.entity.id });
```

For each block, scan for `mention` types where `mention.user.id === partnerNotionId`. If found, build signal with sub-source `notion_mention`.

For property updates, check if the changed property is type `people` and includes partner → sub-source `notion_assigned`.

### Idempotency

Notion may deliver duplicate webhooks. The dedup key uses block ID + last-edited-time:

```
dedupKey = `notion:${blockId}:${lastEditedTime}`
```

A given content state is only ingested once even if Notion sends multiple webhooks for it.

---

## Granola

### API access

Public API — https://docs.granola.ai. Requires a paid Granola plan.
- **Base URL:** `https://public-api.granola.ai/v1` (note: **not** `api.granola.ai` — that host 404s)
- **Auth:** `Authorization: Bearer grn_…`
- **Key:** Granola **desktop app** → Settings → Connectors → API keys → "Create new key". Stored as `GRANOLA_API_KEY`; base overridable via `GRANOLA_API_BASE`.

> The list endpoint only returns notes that already have a generated AI **summary + transcript**, and there are **no pre-extracted action items** in the API. So we ingest each note's `summary_text` and let the normal extractor pull tasks (same path as every other source).

### Polling loop

```ts
@Cron('*/30 * * * * *') // every 30s (BullMQ repeatable job)
async pollGranola() {
  const since = (await this.getPollState()).lastPolledAt;

  // 1. List notes updated since last poll (cursor-paginated, page_size ≤ 30)
  //    GET /v1/notes?updated_after=<iso>&page_size=30&cursor=<...>
  //    → { notes: [{ id, title, owner:{name,email}, created_at, updated_at }], hasMore, cursor }
  const notes = await this.fetchNotes(since);

  // 2. Fetch each note's detail for the summary, build one signal per note
  for (const note of notes) await this.processNote(note);

  await this.updatePollState({ lastPolledAt: new Date() });
}
```

`updated_after` (not `created_after`) is used so notes whose summary lands after creation aren't missed.

### Note processing

One signal per note, built from `summary_text` (falling back to `summary_markdown`), deduped by note id. The extractor pulls actionable tasks from the summary.

```ts
async processNote(summary: GranolaNoteSummary) {
  // GET /v1/notes/{id} → { …, summary_text, summary_markdown, web_url, transcript }
  const detail = await this.get(`/notes/${summary.id}`);
  const body = (detail.summary_text || detail.summary_markdown || '').trim();
  if (!body) return; // no summary yet → skip

  await this.signals.insert({
    source: 'granola',
    subSource: 'granola',
    externalId: summary.id,
    dedupKey: `granola:${summary.id}`,
    payload: {
      title: summary.title || 'Granola meeting note',
      body,
      author: summary.owner,           // { name, email }
      url: detail.web_url,
      occurredAt: summary.created_at,
      raw: { noteId: summary.id },
    },
  });
}
```

**Folder scoping (required):** set `GRANOLA_FOLDER_IDS` to the folder(s) to poll (private or shared),
**comma-separated** (e.g. `fld_a,fld_b`) — the service runs one `GET /v1/notes?folder_id=…` query per folder
and dedups by note id. A folder that fails (bad/inaccessible id) is logged and skipped so the rest still
sync. **Empty disables Granola polling entirely** (logged once at boot). Discover ids from the Granola
dashboard, or `GET /v1/folders` with the bearer key (`{ folders: [{ id, name }] }`).

### Failure modes

- API rate limits: backoff and retry, log if >5min behind
- API down: polling continues, no signal loss (cron will catch up when API returns)
- Partner cancels Granola subscription: ingestion stops cleanly, no errors propagate to other sources
