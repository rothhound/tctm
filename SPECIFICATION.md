# Assistant — Technical Specification

**Status**: Draft v1.0
**Last updated**: 2026-05-19
**Owner**: Gianfranco
**Audience**: Engineers building and maintaining this system

---

## 1. Purpose

A single-user task extraction and management system for a venture capital managing partner. It ingests signals from Gmail, Slack, Notion, and Granola, uses Claude to extract actionable tasks, and surfaces them in a focused mobile-first interface.

### 1.1 Why this exists

Senior VC partners receive 200+ emails, 10+ meetings, and dozens of Slack messages per day. Buried in this flow are concrete commitments: "send the cap table by Friday", "review the v3 deck", "intro Jane to the Sequoia team". These commitments are currently tracked in the partner's head, on scraps of paper, or not at all. Things fall through cracks. This system catches them.

### 1.2 Non-goals

- **Not a team task manager.** Single user. No sharing, no assignment to others, no team views.
- **Not a CRM.** Entities exist only to disambiguate task context. Not a contact database.
- **Not a calendar.** Reads meeting notes from Granola, but does not schedule or modify calendar events.
- **Not a chatbot.** No conversational interface. Tasks come from real signals, not chat with an LLM.
- **Not generally available.** This is built for one person on their infrastructure. Multi-tenancy is explicitly out of scope.

### 1.3 Success criteria

The system is successful when, after 30 days of use:

1. The partner checks the inbox at least once a day without prompting
2. Auto-create false-positive rate is under 10% (fewer than 1 in 10 auto-created tasks are dismissed as noise)
3. The partner reports that at least one task per week was caught that they would have otherwise missed
4. Review queue stays under 20 items at any time (signal that auto-create thresholds are tuned correctly)

---

## 2. Users and use cases

### 2.1 The user

One person: a managing partner at a Bay Area venture capital firm. They:

- Travel constantly, switching between laptop, iPhone, and iPad
- Live in email and Slack during the workday
- Use Granola for meeting notes
- Maintain a portfolio/CRM in Notion
- Receive a high volume of incoming asks from founders, LPs, fellow partners, and external operators
- Have an executive assistant for scheduling but no one curating their task list

### 2.2 Primary use cases

1. **Morning triage.** First thing in the morning, partner opens the PWA on their phone, sees:
   - 3 tasks needing review (judge wasn't sure)
   - 12 tasks in inbox (auto-created since last check)
   - Triages all of them in under 5 minutes, moving to Today/This Week/Waiting On/Dismiss

2. **Real-time capture.** During the day, while in meetings or on calls, new tasks accumulate silently. The partner doesn't need to do anything — the system reads their email, Slack, and meeting notes and queues tasks for later triage.

3. **Manual task creation via 🎯 reaction.** When the partner sees a Slack message they want to act on later, they react with 🎯 and the message becomes a task automatically.

4. **Waiting-on tracking.** When the partner sends an email asking for something, the system creates a "waiting on" task. When the recipient replies, the system auto-resolves the task.

5. **End-of-week review.** Friday afternoon, partner reviews completed tasks and what's still in Waiting On to see who owes them what.

---

## 3. Architecture

### 3.1 High-level diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SOURCES                                                            │
│  Gmail (Pub/Sub)    Slack (Events API)    Notion (webhooks)    Granola (poll)│
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER (NestJS controllers + cron services)                        │
│  - Signature verification, replay protection                                 │
│  - Source-specific payload → normalized Signal                               │
│  - Idempotent insert (dedup_key UNIQUE)                                      │
│  - Enqueue extraction job                                                    │
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │ BullMQ: signals.extract
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EXTRACTION PIPELINE                                                         │
│  1. Load signal + entity glossary                                            │
│  2. Claude Opus 4.7 extract → ExtractedTask[]                                │
│  3. For each task: Claude Haiku 4.5 judge → KEEP/REVIEW/DISMISS              │
│  4. Apply per-source thresholds → final routing decision                     │
│  5. Dedup hash check → merge or insert                                       │
│  6. Persist task with provenance metadata                                    │
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STORAGE                                                                     │
│  Postgres: signals, tasks, entities, feedback, audit_log, source_config      │
│  Redis: BullMQ queues, entity glossary cache                                 │
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  API + PWA                                                                   │
│  NestJS REST → Vite/React PWA → Web Push for notifications                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component boundaries

| Component | Responsibility | Stateless? |
|-----------|---------------|------------|
| Ingestion controllers | Verify, normalize, enqueue | Yes |
| Signal store | Idempotent persistence of inbound events | N/A (DB) |
| Extraction processor | Orchestrates extract → judge → route | Yes |
| Extractor service | Single Claude Opus call, output validation | Yes |
| Judge service | Single Claude Haiku call, adversarial QC | Yes |
| Tasks service | Dedup, persist, feedback recording | Yes |
| Entities service | Glossary rendering, mention resolution | Yes (caches in-memory) |
| Waiting-on resolver | Per-signal check for resolution of open waits | Yes |
| Web push notifier | Sends alerts for review-pending and daily brief | Yes |

The key architectural principle: **every component is stateless except the database**. This means horizontal scaling is trivial if ever needed, and any single process can be killed and restarted without losing state.

### 3.3 Why these choices

- **NestJS over plain Express/Fastify**: Dependency injection makes the multi-stage extraction pipeline easy to test in isolation. Decorators keep webhook signature verification declarative.
- **Drizzle over TypeORM/Prisma**: Better TypeScript inference for `jsonb` columns. Migrations are SQL-first, which matters for schema clarity.
- **BullMQ over plain Redis pub/sub**: Built-in retry policies, dead-letter queues, and observability. Critical for webhook reliability.
- **Single processing queue per stage** (not per source): The "Signal" abstraction means downstream stages don't care about source. Adding a new source (Telegram, Twitter DMs) is a controller + ingestion service — nothing downstream changes.
- **Postgres jsonb for payloads**: Schema-flexible for source-specific data while keeping the core columns relational. We get the best of both.
- **Vite + React PWA over native iOS**: One codebase, installable on iPhone home screen, web push works on iOS 16.4+, far less maintenance than React Native + App Store.

---

## 4. Data model

### 4.1 Entity-relationship overview

```
entities ──────────────────┐
   │ (referenced by ID)    │
   │                       │
   ▼                       │
tasks ◀────── extraction_feedback
   │                       │
   │ (sourceSignalIds)     │
   │                       │
   ▼                       │
signals ◀──────────────────┘ (referenced by ID)
   │
   ▼
llm_audit_log
```

### 4.2 Core tables

See `apps/api/src/db/schema/index.ts` for the authoritative Drizzle schema. Conceptual summary:

#### `signals`
Normalized inbound events. One row per upstream event (email, Slack message, Notion update, Granola note). The `dedup_key` is `${source}:${externalId}` and has a UNIQUE constraint — receiving the same webhook twice is a no-op.

#### `tasks`
The user-facing task list. Each task has full provenance: the originating signal IDs, the exact source quote that justified extraction, the confidence signals, and the judge verdict.

Task states form this lifecycle:

```
              ┌──────────────────┐
              │                  ▼
[extracted] → review_pending ──┐
              │                ├──→ inbox → today / this_week / waiting_on → done
              │                │            │            │            ▲
              ▼                │            └────────────┘            │
          dismissed            │                                       │
                               └─→ snoozed ───────────────────────────┘
```

`review_pending` exists when judge said REVIEW or auto-create thresholds weren't met. The partner moves these manually.

`inbox` is the default for high-confidence auto-created tasks. The partner triages these into a day bucket.

`waiting_on` can be auto-resolved by incoming signals (see §6.4).

#### `entities`
People, companies, funds, and deals the partner cares about. Each entity has a canonical name, aliases, contact info (emails, Slack IDs, Notion page IDs), and free-form context that gets injected into the extraction prompt.

Bootstrap: imported once from a Notion CRM database. Maintained: auto-suggested for new mentions, manually confirmed.

#### `extraction_feedback`
Every user action on a task (accept, edit, dismiss, auto-resolve) is recorded with a snapshot of the extraction at the time. This is the dataset for tuning prompts and thresholds.

#### `llm_audit_log`
Every LLM call: model, tokens, latency, cost, full input/output snapshot. For debugging extraction failures, validating cost projections, and demonstrating to the partner exactly what was sent to Anthropic and what came back.

#### `source_config`
Per-source thresholds (autoCreate, skipBelow) and filters. Editable from the admin UI without redeploying.

### 4.3 Why a `Signal` abstraction

You could store raw provider payloads (gmail_messages, slack_messages, etc.) and process them source-by-source. We don't. The Signal abstraction means:

- One extraction pipeline serves all sources
- Adding a source is purely an ingestion change
- Re-running extraction on historical data is one query, not four
- Cross-source dedup ("the founder Slacked me about the same thing they emailed about") works at the task layer because all signals look alike

The cost: a translation layer per source. Worth it.

---

## 5. Extraction pipeline (detailed)

This is the heart of the system. Get this wrong and the partner stops using it within a week.

### 5.1 Stage 1: Extract

**Model**: Claude Opus 4.7
**Input**: One Signal + cached entity glossary
**Output**: `ExtractionResult { tasks: ExtractedTask[], noTask: boolean }`

The extractor prompt (see `apps/api/src/extraction/prompts.ts`) instructs Claude to:

1. Determine whether the signal contains a task at all (returns `noTask: true` if not)
2. For each task it finds, return a structured object with:
   - `title`, `description`, `type`, `dueAtIso`
   - `entityRefs` (mentions resolved against the glossary)
   - `sourceQuote` (the exact text that justified the task — critical for the review UI)
   - `signals` (5-axis confidence: explicitness, actionability, addressedToUser, entityMatchConfidence, temporalClarity)
   - `overallConfidence` and `ambiguityFlags`

The prompt uses **prompt caching** for the system message. The entity glossary is the bulk of the system prompt and changes only when entities update (at most hourly). Cache hit rate in steady state is ~95%, making extraction calls ~3x cheaper than they'd otherwise be.

The output is validated with a Zod schema. Invalid output → exception → BullMQ retry.

### 5.2 Stage 2: Judge

**Model**: Claude Haiku 4.5
**Input**: One ExtractedTask + last 48h of tasks (for dedup context)
**Output**: `JudgeVerdict { verdict: 'KEEP' | 'REVIEW' | 'DISMISS', reason: string }`

The judge is adversarial: its job is to find reasons the proposed task should not be auto-created. Common DISMISS reasons:

- FYI / newsletter content
- Action belongs to someone else, not the partner
- Near-duplicate of a recent task
- Already-completed action written in past tense
- Social pleasantry phrased as a question

If the judge errors or outputs invalid JSON, it defaults to REVIEW (fail-safe).

### 5.3 Stage 3: Threshold routing

After extract and judge, the processor decides:

```
if (judge == DISMISS):
    → tasks table with status='dismissed' (kept for learning)

else if (judge == REVIEW or thresholds not met or ambiguityFlags exist):
    → tasks table with status='review_pending'

else:
    → tasks table with status='inbox', autoCreated=true
```

Thresholds are per-source (see §5.4). The check is:

```ts
const meetsAutoCreate =
  signals.explicitness    >= thresholds.autoCreate.explicitness    &&
  signals.actionability   >= thresholds.autoCreate.actionability   &&
  signals.addressedToUser >= thresholds.autoCreate.addressedToUser &&
  overallConfidence       >= thresholds.autoCreate.overallConfidence &&
  ambiguityFlags.length   === 0;
```

Note this is a conjunction across **multiple axes**, not a single `confidence > 0.8` check. LLM confidence numbers are miscalibrated; multi-axis checks are more robust.

### 5.4 Per-source threshold rationale

| Sub-source | Bias | Reason |
|-----------|------|--------|
| `granola` | Aggressive | Granola already extracts action items; we're re-confirming, not discovering |
| `slack_reaction` | Always create | Partner explicitly tagged with 🎯 — no judgment needed |
| `slack_dm` | Moderate | Direct ask, but tone varies (some DMs are casual) |
| `slack_channel` | Conservative | High noise; lots of FYI |
| `gmail_vip` | Moderate | From a known entity; signal is high but extractor can over-fire |
| `gmail_cold` | Very conservative | Cold inbound pitches; most are not tasks |
| `notion_mention` | Moderate | Explicit @ mention is meaningful |
| `notion_assigned` | Aggressive | Database row explicitly assigned to user |

Thresholds live in the `source_config` table and can be edited without redeploy. Defaults are seeded from the values in `extraction.processor.ts`.

### 5.5 Dedup at the task layer

After routing, before insert, compute:

```ts
dedupHash = sha256(
  normalize(title) + '|' +
  type + '|' +
  sortedEntityIds.join(',')
).slice(0, 16);
```

If a task with the same hash exists in the last 7 days, do **not** insert. Instead, append the new signal ID to the existing task's `sourceSignalIds`. This handles the common case: an email about a meeting + the Granola note of that meeting + a Slack thread all generate the same task.

For more aggressive dedup later, we can add a semantic layer (pgvector embeddings on title, cosine similarity > 0.85 → merge). Not needed for v1.

### 5.6 Cost projection

Based on Anthropic Claude 4 pricing (verify before relying on these numbers):

Per signal (assuming entity glossary ~5k tokens, signal body ~500 tokens):

| Stage | Model | Input tokens | Output tokens | Cost |
|-------|-------|-------------|--------------|------|
| Extract (cache hit) | Opus 4.7 | ~500 input + 5k cache read | ~500 | ~$0.05 |
| Judge | Haiku 4.5 | ~1k | ~100 | ~$0.001 |
| **Per signal total** | | | | **~$0.05** |

Estimated daily volume:
- Gmail: ~100 signals after filtering
- Slack: ~50 signals (DMs + mentions only)
- Notion: ~5 signals
- Granola: ~5 signals
- **Total**: ~160 signals/day

Monthly extraction cost: **~$240/month**. Add ~$50/mo for AWS infra → **~$290/mo all-in**.

For a partner at a top VC, this is rounding error. But if costs need to drop, the largest lever is filtering at ingestion (don't extract on newsletters at all) and using Haiku for low-priority sources.

---

## 6. Source integrations (detailed)

### 6.1 Gmail

**Mechanism**: Gmail API + Cloud Pub/Sub push to webhook

**Setup** (one-time):
1. Create GCP project owned by the partner
2. Enable Gmail API and Pub/Sub API
3. Create OAuth client; complete OAuth flow once to get refresh token
4. Create Pub/Sub topic `gmail-push` and push subscription pointing to `https://<domain>/webhooks/gmail/push`
5. Call `users.watch` with labelIds filter (only INBOX, not Promotions/Updates/Social)
6. Schedule daily cron to renew watch (expires every 7 days)

**Webhook handling**:
1. Verify JWT in `Authorization` header against Google's public keys
2. Decode Pub/Sub message → get `historyId`
3. Call `users.history.list` with stored last historyId
4. For each `messagesAdded` event, fetch the message
5. Filter: skip if from a known auto-sender domain, skip if no body, skip if already in `signals` table
6. Build Signal: subSource is `gmail_vip` if author email matches an entity, else `gmail_cold`
7. Insert + enqueue extraction

**Edge cases**:
- HistoryId can become invalid (older than 7 days). On 404, do a full sync of the last 24h.
- Threads: the signal is per-message, not per-thread. Dedup at the task layer handles repeated extraction.
- Large attachments: don't fetch attachment bytes. The body is enough for extraction.

### 6.2 Slack

**Mechanism**: Events API push to webhook

**Setup** (one-time):
1. Create Slack app in the partner's workspace
2. Subscribe to bot events: `message.im`, `message.channels`, `app_mention`, `reaction_added`
3. Install app to workspace, grant scopes: `channels:history`, `chat:write`, `im:history`, `users:read`, `users:read.email`, `reactions:read`
4. Store bot token in Secrets Manager

**Webhook handling**:
1. Verify `X-Slack-Signature` HMAC against signing secret
2. Reject if timestamp older than 5 minutes (replay protection)
3. For URL verification handshake, return challenge
4. For event_callback, ack 200 immediately, process async
5. Filter: ignore bot messages, ignore partner's own outbound, ignore subtypes (joins, etc.)
6. For `reaction_added` with the configured emoji (🎯), only process if reactor is the partner
7. Build Signal with subSource `slack_dm` / `slack_channel` / `slack_reaction`
8. Insert + enqueue extraction

**Edge cases**:
- Slack retries up to 3 times if we don't 200 within 3 seconds. We ack first, process after.
- User/channel info lookups are rate-limited heavily; cache them in Redis with 1h TTL.
- Edits send a new event with `subtype: 'message_changed'`. Skip these for v1 (avoid duplicate extraction); v2 could re-extract if the edit substantially changes content.

### 6.3 Notion

**Mechanism**: Notion webhooks (native, GA as of late 2024)

**Setup** (one-time):
1. Create Notion integration in partner's workspace
2. Share relevant databases (CRM, projects, deal flow) with the integration
3. Configure webhook subscription for: `page.created`, `page.updated`, `comment.created`
4. Store integration token in Secrets Manager

**Webhook handling**:
1. Verify `X-Notion-Signature`
2. For each event, fetch the page content via Notion API
3. Detect mentions of the partner: search blocks for `@mention` of their Notion user ID
4. Detect database assignments: if the changed property is "Assignee" or "Owner" and value is the partner
5. Build Signal with subSource `notion_mention` or `notion_assigned`
6. Insert + enqueue extraction

**Edge cases**:
- Notion sends webhooks for any change including formatting tweaks. Diff before processing.
- Large pages: truncate body to first 4000 chars for extraction.

### 6.4 Granola

**Mechanism**: Polling (Granola has no public webhooks as of 2026; on their roadmap)

**Setup** (one-time):
1. Generate Granola Personal API key
2. Store in Secrets Manager

**Polling loop**:
1. BullMQ repeatable job every 30 seconds
2. Call `GET /v1/notes?since=<lastPolledAt>`
3. For each new note: extract structured action items (Granola pre-extracts these)
4. For each action item, build a Signal with subSource `granola`
5. Update `granola_poll_state.lastPolledAt`

**Why polling at 30s is fine**: Granola notes are appended after meetings end, not during. 30s lag is invisible. If Granola ships webhooks, swap the cron for a controller — Signal layer doesn't care.

### 6.5 Waiting-on resolution

When a `waiting_on` task is created with an associated entity (the person we're waiting on), we want to auto-resolve it when that person responds.

**Mechanism**: After every new Signal is ingested, check if its author matches an entity that's the subject of any open `waiting_on` task.

```
for each new signal:
    if signal.author resolves to entity E:
        find open waiting_on tasks where E ∈ waitingOnEntityIds
        for each such task:
            call Haiku: "Does this message resolve this task?"
            if yes:
                mark task done with completion source = this signal
                send web push: "✅ {task title} auto-resolved"
```

This is the killer feature. It only works if entity resolution is solid — see §7.

---

## 7. Entity resolution

### 7.1 What entities are

Entities are the partner's mental model: the people, companies, funds, and deals they care about. They give extraction context. Without entities, "follow up with Roelof" extracts as a vague task. With entities, it becomes "Follow up with Roelof Botha (Sequoia) on Acme Series B term sheet".

### 7.2 Bootstrap

The partner already has this information somewhere — usually a Notion CRM database. The bootstrap script reads that database once and creates entity rows:

```
infra/scripts/bootstrap-entities-from-notion.ts
```

Configurable: which Notion DBs to read, which properties map to entity fields (name → canonical_name, email → emails, etc.).

### 7.3 Resolution at extraction time

The extractor prompt includes the entity glossary as XML. Claude resolves mentions against this glossary and returns `entityRefs` with `entityId` set when confident.

Post-extraction, the processor does a second-pass fuzzy resolution:

1. For each `entityRef` with no `entityId`:
   - If `mention` looks like an email, exact-match against `entities.emails`
   - If author of signal has known email, see if mention aliases that author
   - If still unmatched, leave as raw mention (extraction quality degrades but task still useful)

### 7.4 Discovery

When extraction yields a mention that doesn't resolve, log it to a `unknown_mentions` table (TODO in v1). Weekly, surface top unknown mentions to the partner: "I keep seeing 'Alfred Lin' but don't have him as an entity. Add him?"

This is how the entity table stays current without manual curation.

---

## 8. Frontend (PWA)

### 8.1 Views

The entire app is four views and a settings page. No more.

1. **Today** — tasks committed to today. The default landing view.
2. **This Week** — tasks committed to this week but not today.
3. **Waiting On** — tasks where someone owes the partner something.
4. **Inbox** — auto-created tasks awaiting triage.
5. **Review** — tasks the judge flagged for human review.

Settings is a separate route with: source toggles, threshold tuning sliders, entity management, audit log viewer.

### 8.2 Task card UX

Every task card shows:

- Title (large)
- Description (smaller, one line)
- Source icon + entity chips (e.g., 📧 Roelof, Acme)
- One-tap to expand: full source quote, link to original message, judge verdict reason
- Swipe right: accept (with destination menu: Today / This Week / Waiting On / Snooze)
- Swipe left: dismiss (with optional reason)
- Long-press: edit title/description inline

### 8.3 Mobile-first

The PWA is built for iPhone first. Desktop is a courtesy view.

- Installable to home screen
- Web push notifications (iOS 16.4+)
- Single column, large touch targets, swipe gestures
- No hover states; everything works on touch
- Optimistic UI: actions feel instant, sync in background

### 8.4 Daily brief

Once a day (configurable, default 7am partner-local), web push notification:

> 🌅 Good morning. 3 must-do today, 2 waiting on responses, 4 new in inbox.

One tap opens Today view.

### 8.5 Snooze parsing

Natural-language snooze: "Snooze until Tuesday", "after the board meeting", "next month". Parsed by Claude Haiku (small classifier prompt). Falls back to a picker if parse confidence is low.

---

## 9. Security

### 9.1 Threat model

The partner's inbox, Slack DMs, and Notion contain:
- LP communications (legally privileged)
- Board materials (insider information)
- Active deal terms (subject to NDAs)
- Personal correspondence

A breach is a career-ending event. Security is paramount.

### 9.2 Controls

| Control | Implementation |
|---------|---------------|
| Encryption at rest | RDS storage encryption with AWS KMS |
| Encryption in transit | TLS 1.2+ everywhere, including internal Caddy→Node hop |
| Secrets storage | AWS Secrets Manager; no plaintext in env files in production |
| OAuth token storage | Encrypted with libsodium sealed boxes before DB insert; key in Secrets Manager |
| Webhook authentication | HMAC/JWT verification on every inbound request |
| Replay protection | Reject webhook timestamps older than 5 minutes |
| Network isolation | EC2 only accepts traffic from CloudFront prefix list; RDS only from EC2 SG |
| SSH access | Only from the operator's IP, ed25519 keys, no passwords |
| Audit log | Every LLM call recorded with input/output; every task action logged |
| No PII in observability | Sentry/Datadog redact message bodies before send |
| Anthropic API | Direct, not via any LLM gateway; zero-retention enabled |
| Backup encryption | RDS automated backups inherit storage encryption |

### 9.3 Data retention

- Signals: retained 90 days, then archived to S3 (encrypted), deleted from Postgres
- Tasks: retained indefinitely (low volume, high value)
- Audit log: retained 1 year, then archived
- Extraction feedback: retained indefinitely (training data)
- LLM API requests: zero-retention enabled on Anthropic account

### 9.4 Operator access

The operator (Gianfranco) has SSH access for maintenance. By policy:
- No accessing message bodies for non-debugging reasons
- All debugging done with redacted samples where possible
- Operator's SSH key access can be revoked unilaterally by the partner

---

## 10. Operations

### 10.1 Deployment

GitHub Actions → SSM Run Command on EC2 → `git pull && npm ci && npm run build && pm2 reload`. No containers, no orchestration. For a single-instance app, this is the right level of complexity.

Database migrations run via SSM separately, gated by approval.

### 10.2 Monitoring

CloudWatch alarms:
- EC2 CPU > 80% for 10 minutes → page
- RDS free storage < 5 GB → page
- BullMQ failed jobs > 10 in an hour → notify
- Extraction error rate > 5% in an hour → notify
- Daily cost from Anthropic > 2x baseline → notify

Logs aggregated to CloudWatch Logs with 30-day retention.

### 10.3 Backups and disaster recovery

- RDS automated daily snapshots, 7-day retention
- Weekly RDS snapshot copied to S3, 90-day retention
- Disaster recovery RTO: 2 hours (provision new EC2, restore RDS from snapshot, redeploy)
- Disaster recovery RPO: 24 hours (worst case lose 1 day of signals)

### 10.4 Updates

- Application: deploy any time
- Node version: monthly LTS check
- OS packages: monthly `apt upgrade` during maintenance window
- Postgres major versions: yearly, with full backup beforehand

---

## 11. Tuning and learning

### 11.1 Weekly calibration

Every Sunday at 9am, a cron job:

1. Pulls the last week of `extraction_feedback` rows
2. Groups dismissed auto-creates by ambiguity flag patterns
3. Sends a sample (50 max) to Claude Opus with prompt: *"Identify patterns. Propose 3 prompt or threshold changes to reduce false positives without increasing false negatives."*
4. Writes output to `/admin/calibration-reports/{date}.md` for human review

**No automatic prompt or threshold changes.** The operator reads the report, decides what to apply, and commits the changes. Drift in unattended prompt tuning is a real failure mode; we avoid it.

### 11.2 Threshold tuning UI

Settings page exposes sliders for each sub-source's autoCreate thresholds. Changes write to `source_config` table; new extractions use new thresholds immediately (no redeploy).

A "shadow mode" toggle lets the partner test threshold changes: for 24h, new auto-creates go to a separate `shadow_inbox` instead of `inbox`. The partner reviews shadow output to validate the new thresholds before committing them.

### 11.3 Metrics dashboard

Settings → Metrics shows:
- Per-source signals/day over the last 30 days
- Auto-create vs review-pending vs dismissed ratios
- False positive rate (dismissed auto-creates / total auto-creates)
- Mean time to triage (signal created → user action)
- LLM cost per day, broken down by stage and source

---

## 12. Build plan

### 12.1 Phasing

**Phase 1 — Foundation (Week 1)**
- AWS infra via Terraform
- Postgres schema, migrations
- BullMQ wiring, queue setup
- NestJS app shell, health check
- Entity table + Notion bootstrap script
- *Exit criteria: deployable, infrastructure costs visible, entities loaded*

**Phase 2 — Slack end-to-end (Week 2)**
- Slack controller with signature verification
- Slack ingestion service (message/DM/reaction handlers)
- Extractor service with caching
- Judge service
- Extraction processor with threshold routing
- Tasks service with dedup
- Minimal PWA: Inbox and Review views, accept/dismiss
- *Exit criteria: partner can react with 🎯 in Slack and see a task appear in the PWA*

**Phase 3 — Quality and trust (Week 3)**
- Eval dataset: 50 hand-labeled signals
- Prompt iteration based on eval pass rate
- Source provenance UI (show source quote on every task)
- Audit log viewer
- Web push notifications
- *Exit criteria: partner trusts the system enough to use it daily*

**Phase 4 — Remaining sources (Weeks 4-5)**
- Notion webhooks
- Gmail Pub/Sub + watch renewal
- Granola polling
- Waiting-on resolver
- *Exit criteria: all four sources feeding tasks; waiting-on auto-resolution working*

**Phase 5 — Polish (Week 6)**
- Today / This Week views
- Natural-language snooze
- Daily morning brief
- Threshold tuning UI
- Weekly calibration cron
- *Exit criteria: feature-complete, ready for sustained use*

### 12.2 Eval dataset

Before Phase 3, build a hand-labeled eval set:
- 50 signals, ~12 from each source
- For each: human label of correct extraction (or noTask)
- Run extractor + judge against the set, measure:
  - Recall: % of true tasks correctly extracted
  - Precision: % of extracted tasks that are real
  - Judge accuracy: % of judge verdicts matching human verdict
- Iterate on prompts until precision >= 90%, recall >= 80% on this set
- Re-run eval set on every prompt change

This eval set is the floor: anything that breaks here breaks for the user.

### 12.3 What to build first within Phase 2

The temptation is to start with extraction (it's the most interesting). Resist. The right order within Phase 2:

1. **Slack controller + signature verification** — testable in isolation with curl
2. **Slack ingestion service** — testable with recorded webhook payloads
3. **Signal persistence + dedup** — testable with unit tests
4. **Extractor service** — testable against the eval set
5. **Judge service** — testable against the eval set
6. **Extraction processor (wiring)** — integration test with all of the above
7. **Tasks API + PWA Inbox view** — last, because everything above must work first

---

## 13. Open questions

These need decisions before Phase 2 begins:

1. **Partner's identity in extraction prompts.** What name, what role, what current context? Hardcoded in env, or DB-driven and editable?
2. **Domain ownership.** Whose domain registrar holds `assistant.<domain>`? Partner's, or operator's?
3. **GCP project ownership.** Partner's AWS organization, partner's personal GCP, or a new dedicated GCP project? (Recommend: dedicated project, owned by partner.)
4. **Granola license.** Partner needs Granola Pro for API access. Confirm they have it.
5. **Notion CRM schema.** Bootstrap script needs to know which databases and which properties. Get a sample export before writing it.
6. **Reaction emoji.** 🎯 by default. Confirm the partner is okay with it (unused for other purposes in their Slack workspaces).
7. **Daily brief time.** 7am partner-local, or configurable from first use? (Recommend: 7am default, settable in app.)
8. **Web push provider.** Browser-native Web Push (VAPID), or APNs via a service? (Recommend: VAPID for simplicity.)

### Resolved decisions (from prior conversation)

- LLM extraction with Claude (not rules)
- Push-based ingestion (webhooks + Pub/Sub + polling for Granola)
- Single-tenant
- AWS hosting (not Hetzner/Fly)
- Confidence-based auto-creation with review queue for ambiguous cases
- The partner wants a full task manager (not just routing to Things/Reminders)

---

## 14. Glossary

- **Signal**: a normalized inbound event from any source
- **Extraction**: the process of turning a signal into zero or more tasks
- **Judge**: the adversarial second-pass check before auto-creation
- **Auto-create**: a task that bypasses the review queue and lands in inbox
- **Review pending**: a task that requires human triage before any further action
- **Inbox**: the bucket for auto-created tasks awaiting day-bucket triage
- **Sub-source**: a finer-grained source classification (e.g., `slack_dm` vs `slack_channel`)
- **Dedup hash**: a 16-char hash used to merge near-duplicate tasks
- **Entity glossary**: the XML representation of all entities, cached and injected into the extraction prompt
- **Provenance**: the chain of evidence (source quote, signals, judge verdict) that justifies a task

---

## 15. Document maintenance

This specification is the source of truth for system design. When implementation diverges from this document:

- If the divergence is intentional, update this doc in the same PR
- If unintentional, fix the code

PRs that change architecture, data model, or pipeline behavior must update this document. Reviewers should reject PRs that change behavior without corresponding spec changes.
