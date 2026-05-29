# Build Plan

Concrete, ticketed work breakdown. Each ticket is sized to complete in 1-4 hours by an experienced engineer. Phase boundaries are exit criteria, not time boxes.

Tickets are labeled `[P1]`/`[P2]`/`[P3]` for phase, `[BE]`/`[FE]`/`[INFRA]` for area.

---

## Phase 1 — Foundation

Goal: deployable system with empty schema, ready to receive signals.

### Tickets

- **P1-INFRA-01** Provision AWS infrastructure via Terraform (apply `infra/terraform/`)
- **P1-INFRA-02** Configure DNS, ACM cert, CloudFront pointing at EC2
- **P1-INFRA-03** Deploy app via SSM: clone, install, build, pm2 start
- **P1-INFRA-04** Set up CloudWatch alarms (CPU, RDS storage, BullMQ failures)
- **P1-INFRA-05** Configure GitHub Actions for SSM-based deploys
- **P1-BE-01** Postgres schema via Drizzle migrations
- **P1-BE-02** Seed `source_config` table with default thresholds
- **P1-BE-03** Health check endpoint `/health` returning DB + Redis status
- **P1-BE-04** Secrets Manager integration: load secrets at boot, inject into ConfigService
- **P1-BE-05** OAuth token encryption helper (libsodium sealed boxes)
- **P1-BE-06** Bootstrap script: load entities from Notion CRM database
- **P1-BE-07** CLI for one-off ops: `npm run cli -- auth:gmail`, `npm run cli -- entities:reload`

### Exit criteria
- [ ] `https://<domain>/health` returns 200 with `{ db: "ok", redis: "ok" }`
- [ ] Postgres has all tables, entities table populated from Notion
- [ ] CloudWatch shows infrastructure healthy
- [ ] CI pipeline deploys main branch on push

---

## Phase 2 — Slack end-to-end

Goal: partner reacts with 🎯 in Slack, sees a task appear in the PWA. Full pipeline working for one source.

### Tickets

#### Backend
- **P2-BE-01** Slack signature verification helper + unit tests
- **P2-BE-02** Slack controller: URL verification, event_callback, async processing
- **P2-BE-03** Slack ingestion service: message/reaction → Signal mapping
- **P2-BE-04** Slack user/channel cache layer (in-memory for v1, Redis-backed later)
- **P2-BE-05** Signal persistence with onConflict dedup
- **P2-BE-06** BullMQ signals.extract queue + repeatable job for failed retries
- **P2-BE-07** Extractor service with prompt caching
- **P2-BE-08** Zod validation of extractor output
- **P2-BE-09** Judge service with last-48h context
- **P2-BE-10** Extraction processor: orchestrate extract → judge → route
- **P2-BE-11** Threshold loading from source_config with defaults fallback
- **P2-BE-12** Dedup hash computation + 7-day lookup
- **P2-BE-13** Tasks service: create, accept, edit, dismiss, complete
- **P2-BE-14** Extraction feedback recording on every task action
- **P2-BE-15** LLM audit log writes from extractor and judge
- **P2-BE-16** Tasks REST API: list by status, action endpoints
- **P2-BE-17** Entity glossary rendering with 1h cache
- **P2-BE-18** Eval harness: load fixtures, run extractor, compare to gold labels

#### Frontend
- **P2-FE-01** Vite + React project setup, Tailwind, TanStack Query
- **P2-FE-02** PWA manifest, service worker, icon set
- **P2-FE-03** Auth layer (whatever partner prefers — for v1, IP allowlist + magic link)
- **P2-FE-04** App shell: bottom nav with 5 views
- **P2-FE-05** Inbox view: task list with swipe-to-accept, swipe-to-dismiss
- **P2-FE-06** Review view: task list with explicit accept/edit/dismiss buttons
- **P2-FE-07** Task detail modal: source quote, entity chips, link to original
- **P2-FE-08** Accept destination picker (Today / This Week / Waiting On / Snooze)
- **P2-FE-09** Empty states with helpful copy ("Nothing to review — good morning")
- **P2-FE-10** Loading states, optimistic updates with rollback on error

### Exit criteria
- [ ] Partner reacts 🎯 to a Slack message, task appears in PWA within 10 seconds
- [ ] Partner can accept → Today, see task move
- [ ] Partner can dismiss with reason
- [ ] Eval harness reports precision and recall on fixture set
- [ ] All inbox/review tasks show source quote

---

## Phase 3 — Quality and trust

Goal: extraction quality is good enough that the partner uses the system daily.

### Tickets

#### Eval and tuning
- **P3-BE-01** Build eval fixture set: 50 signals across all sources, hand-labeled
- **P3-BE-02** Eval harness: run full pipeline against fixtures, report precision/recall/judge accuracy
- **P3-BE-03** Iterate extractor prompt until eval precision >= 90%, recall >= 80%
- **P3-BE-04** Iterate judge prompt until judge accuracy >= 85%
- **P3-BE-05** Document eval results in `docs/eval-results.md`

#### Audit and transparency
- **P3-BE-06** Audit log query API: filter by purpose, signal, time
- **P3-FE-01** Audit log viewer in settings: see every LLM call for a given task
- **P3-FE-02** "Why this task?" panel on every task: full extraction signals, judge verdict

#### Notifications
- **P3-BE-07** VAPID key generation + web push service
- **P3-BE-08** Push subscription endpoint, user push tokens table
- **P3-BE-09** Notification triggers: new in inbox, new in review, waiting-on auto-resolved
- **P3-FE-03** Push permission UX: in-app prompt, install instructions for iOS

### Exit criteria
- [ ] Eval set precision >= 90%, recall >= 80%
- [ ] Partner can answer "why is this task here?" from the UI without asking the operator
- [ ] Web push works on partner's iPhone

---

## Phase 4 — Remaining sources

Goal: all four sources feeding tasks; waiting-on auto-resolution working.

### Tickets

#### Notion
- **P4-BE-01** Notion webhook signature verification
- **P4-BE-02** Notion webhook controller + URL verification handshake
- **P4-BE-03** Notion API client wrapper with rate limiting
- **P4-BE-04** Page fetcher: retrieve page + blocks, scan for partner mentions
- **P4-BE-05** Database row update handler: detect partner-assigned rows
- **P4-BE-06** Notion ingestion service: webhook payload → Signal
- **P4-BE-07** Notion idempotency: dedup key includes block ID + last-edited-time

#### Gmail
- **P4-BE-08** Google OAuth flow, refresh token capture
- **P4-BE-09** Gmail Pub/Sub JWT verification
- **P4-BE-10** Gmail push webhook controller
- **P4-BE-11** History sync: list history, fetch added messages
- **P4-BE-12** Gmail message → Signal mapping
- **P4-BE-13** Auto-sender domain filter (curated list, ~100 patterns)
- **P4-BE-14** Body text extraction: strip HTML, signatures, quoted replies
- **P4-BE-15** Daily watch renewal cron
- **P4-BE-16** Fallback 24h full sync on historyId 404

#### Granola
- **P4-BE-17** Granola API client
- **P4-BE-18** Granola polling cron (30s)
- **P4-BE-19** Granola note → action items → Signal mapping
- **P4-BE-20** Granola poll state persistence

#### Waiting-on
- **P4-BE-21** Waiting-on resolver: after every signal, check open waiting_on tasks
- **P4-BE-22** Haiku call to determine if signal resolves task
- **P4-BE-23** Auto-resolve workflow: mark done, send push, log to feedback table

### Exit criteria
- [ ] All four sources feeding tasks
- [ ] Partner emails someone, gets reply, sees auto-resolve notification
- [ ] No source has > 5% extraction failure rate in production

---

## Phase 5 — Polish

Goal: feature-complete, ready for sustained use.

### Tickets

#### Day-bucketing
- **P5-FE-01** Today view with date filtering
- **P5-FE-02** This Week view
- **P5-FE-03** Waiting On view with sort by last-update
- **P5-FE-04** Snooze view with date-filtered display
- **P5-FE-05** Drag-and-drop between buckets on desktop, long-press menu on mobile

#### Natural language
- **P5-BE-01** Snooze parser: NL → ISO date via Haiku
- **P5-BE-02** Snooze fallback to date picker on low parse confidence
- **P5-FE-06** Snooze input: text field with parse-as-you-type preview

#### Daily brief
- **P5-BE-03** Brief composer: count tasks by status, format push payload
- **P5-BE-04** Brief cron: 7am partner-local (timezone in user profile)
- **P5-FE-07** Brief settings: time, content toggles

#### Threshold tuning
- **P5-FE-08** Settings → source thresholds: sliders per axis per sub-source
- **P5-FE-09** Shadow mode toggle with 24h shadow inbox view
- **P5-BE-05** Shadow extraction: dual-write to inbox and shadow_inbox

#### Calibration
- **P5-BE-06** Weekly calibration cron: pull dismissed auto-creates, send to Opus
- **P5-BE-07** Calibration report writer: markdown to S3 with date stamp
- **P5-FE-10** Calibration reports browser in settings

#### Metrics
- **P5-FE-11** Settings → metrics dashboard
- **P5-BE-08** Metrics aggregator: daily rollups in a `metrics_daily` table

### Exit criteria
- [ ] All views functional
- [ ] Daily brief delivered for 7 consecutive days without issues
- [ ] First weekly calibration report generated
- [ ] Metrics dashboard accurate to within 5% of raw queries

---

## Backlog / v2 ideas

Not in scope for v1, but recorded so they're not forgotten:

- **Semantic dedup** via pgvector + embeddings (after observing how hash-dedup performs)
- **Entity auto-discovery**: surface unknown mentions to partner with one-tap-to-add
- **Slack thread context**: include parent message + last 3 replies in extraction context for thread messages
- **Email thread context**: include last 2 messages in thread for replies
- **Commitments tracking**: extract commitments the partner makes ("I'll get back to you Tuesday") as waiting_on-style reverse tasks
- **Calendar integration**: read meeting calendar to give extraction context ("this email is about the 2pm meeting with X")
- **Multi-device sync**: today the partner uses iPhone primarily, but iPad/desktop sync is worth considering
- **Voice capture**: dictation → signal via a "manual task" entry point
- **Smart snooze**: "after the board meeting" requires knowing when the next board meeting is
- **Edit detection**: re-extract when a signal is edited (Slack edits, email forwards with new content)
