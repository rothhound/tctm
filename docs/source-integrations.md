# Source Integrations — Implementation Reference

Per-source detail. The main spec covers what; this covers how.

## Gmail

### OAuth setup (one-time, manual)

1. In the partner's GCP project, enable Gmail API and Cloud Pub/Sub API
2. OAuth consent screen: internal app, scopes `gmail.readonly` and `gmail.metadata`
3. Create OAuth 2.0 Client ID (type: Web application)
4. Authorized redirect URI: `https://<domain>/auth/google/callback`
5. Run the bootstrap CLI: `npm run cli -- auth:gmail` — opens browser, partner signs in, refresh token captured and encrypted into Secrets Manager

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
  --push-endpoint=https://<domain>/webhooks/gmail/push \
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

In api.slack.com, create app. Required scopes:

| Scope | Why |
|-------|-----|
| `channels:history` | Read channel messages |
| `im:history` | Read DMs |
| `users:read` | Resolve user IDs to names |
| `users:read.email` | Resolve user IDs to emails (for entity matching) |
| `reactions:read` | Detect 🎯 reactions |

Event subscriptions:

| Event | Why |
|-------|-----|
| `message.im` | Direct messages to partner |
| `message.channels` | Channel messages (filtered by partner's @ mention later) |
| `app_mention` | Explicit @mention of the bot |
| `reaction_added` | 🎯 manual trigger |

Request URL: `https://<domain>/webhooks/slack/events`

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

### Channel filtering

By default, the bot subscribes to all channels it's invited to. The partner only invites the bot to channels they actually want monitored. Channel selection is human, not algorithmic.

`message.channels` events fire for every message in every subscribed channel. We additionally filter in `slackIngestionService.fromMessage`:

```ts
// For channel messages (not DMs), only process if:
// - The partner is @mentioned in the message, OR
// - The message is in a thread the partner started, OR
// - The message is a reaction event from the partner
```

This is much more aggressive filtering than email. Slack channel noise is overwhelming; only direct engagement is worth extracting.

### Rate limits

Slack rate-limits per-method, mostly Tier 3 (50+ RPM):

- `users.info`: cache aggressively, 1h TTL in Redis
- `conversations.info`: same
- `conversations.history`: only called on reaction events, low volume

For startup, prefer `users.list` once and cache the result rather than per-message lookups. Move to Redis-backed cache for production.

---

## Notion

### Integration setup

1. Create internal integration at notion.so/profile/integrations
2. Capabilities: Read content, Read user information
3. Webhook subscription URL: `https://<domain>/webhooks/notion`
4. Subscribe to events: `page.content_updated`, `page.properties_updated`, `comment.created`
5. Share the relevant databases/pages with the integration (in Notion UI)

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

Granola Personal API requires a paid Granola subscription. The partner generates an API key at granola.ai/settings/api.

### Polling loop

```ts
@Cron('*/30 * * * * *') // every 30s
async pollGranola() {
  const state = await this.getPollState();
  const since = state.lastPolledAt;

  const response = await fetch(
    `https://api.granola.ai/v1/notes?since=${since.toISOString()}`,
    { headers: { Authorization: `Bearer ${this.apiKey}` } }
  );

  const { notes } = await response.json();

  for (const note of notes) {
    await this.processNote(note);
  }

  await this.updatePollState({ lastPolledAt: new Date() });
}
```

### Note processing

Granola structures notes with sections including "Action items" pre-extracted. We use those directly rather than re-extracting from the full transcript:

```ts
async processNote(note: GranolaNote) {
  // Skip if no action items
  if (!note.actionItems?.length) return;

  for (const actionItem of note.actionItems) {
    await this.signals.insert({
      source: 'granola',
      subSource: 'granola',
      externalId: `${note.id}:${actionItem.id}`,
      dedupKey: `granola:${note.id}:${actionItem.id}`,
      payload: {
        title: `Action item from ${note.title}`,
        body: actionItem.text,
        author: note.participants?.[0],
        participants: note.participants,
        occurredAt: note.endedAt,
        url: `https://granola.ai/notes/${note.id}`,
        threadId: note.id,
        raw: note,
      },
    });
  }
}
```

The extractor still runs on these, but it's largely re-confirming structured data Granola provided. Thresholds are aggressive (see `extraction.processor.ts`) because the signal quality is high.

### Failure modes

- API rate limits: backoff and retry, log if >5min behind
- API down: polling continues, no signal loss (cron will catch up when API returns)
- Partner cancels Granola subscription: ingestion stops cleanly, no errors propagate to other sources
