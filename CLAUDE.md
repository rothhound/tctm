# Assistant — Task Capture & Triage Manager

Single-tenant task extraction system for a VC managing partner. Ingests signals from Gmail, Slack, Notion, and Granola; uses Claude AI to extract actionable tasks; surfaces them in a mobile-first PWA.

Full spec: `SPECIFICATION.md`. Architecture decisions: `docs/decisions.md`.

## Quick Start

```bash
# Requires Postgres and Redis running locally (brew services, natively, etc.)
npm install
cp apps/api/.env.example apps/api/.env  # fill in secrets
npm run db:setup              # drop + create + migrate + seed (first time)
npm run dev                   # Web :3000, API :4000 (Vite proxies /api → :4000)
```

### Database Scripts

```bash
npm run db:create             # Create the "assistant" database
npm run db:drop               # Drop the database (refuses in production)
npm run db:migrate            # Run Drizzle migrations
npm run db:seed               # Seed source_config thresholds + prompt v1
npm run db:setup              # Drop → create → migrate → seed (full reset)
npm run db:generate           # Generate new migration from schema changes
npm run db:studio             # Open Drizzle Studio GUI
```

## Tech Stack

- **NestJS 11** (Fastify 5 adapter) — API on port 4000
- **React 19** + Vite 6 + Tailwind v4 — dev on port 3000
- **Drizzle ORM** 0.36 — SQL-first migrations, schema at `apps/api/src/db/schema/index.ts`
- **BullMQ** 5 + Redis 7 — async job processing
- **Anthropic SDK** 0.97 — Opus 4.7 (extraction), Haiku 4.5 (judge/classify)
- **PostgreSQL 16** — primary data store
- **npm** workspaces — monorepo (nvm for Node version management)

## Directory Map

```
apps/api/src/
  main.ts                 Fastify bootstrap, global prefix /api, port 4000
  app.module.ts           Root DI — all modules registered here
  auth/                   JWT auth (single-tenant). @Public() for webhooks
  db/                     Drizzle schema, migrate.ts, seed.ts
  shared/                 QueuesModule (BullMQ names), AnthropicModule (SDK + model constants)
  signals/                Signal insert-with-dedup service
  entities/               Entity CRUD + glossary XML cache (1h TTL)
  extraction/             Core pipeline: ExtractorService → JudgeService → ExtractionProcessor
    eval/                 12 hand-labeled fixtures + eval runner (precision/recall)
    prompts.ts            Seed prompt templates (V1 defaults)
    prompt-seeds.ts       Snooze + resolve seed prompts
  prompts/                DB-backed prompt versioning (5min cache, activate/rollback)
  calibration/            Weekly cron: reads extraction_feedback → Opus analysis → draft prompt version
  tasks/                  Task CRUD, subtask auto-completion, recurrence cloning, archive
  ingestion/
    slack/                Events API webhook, HMAC verification, @Public()
    gmail/                Pub/Sub push, JWT verify, history sync, auto-sender filter, watch renewal cron
    notion/               Webhooks, HMAC verify, @mention + assignment detection
    granola/              BullMQ 30s repeatable poll, action items → signals
  waiting-on/             Auto-resolve: match signal author entity → open waiting_on tasks → Haiku check
  notifications/          VAPID web push (subscribe/unsubscribe/send)
  brief/                  Daily morning summary cron (7am Pacific)
  audit/                  LLM audit log query controller
  health/                 GET /api/health (DB + Redis check)
  config/                 Source config CRUD (per-sub-source thresholds)
  metrics/                Aggregated signals/tasks/LLM cost dashboard
  snooze/                 NL date parsing via Haiku

apps/web/src/
  main.tsx                React entry + service worker registration
  App.tsx                 Router: login, 5 bucket views, task detail, settings/*
  store/
    store.ts              Redux + RTK Query
    api.ts                All API endpoints with tag-based cache invalidation
    authSlice.ts          JWT in localStorage
  components/
    layout/               AppShell, BottomNav (badge counts), MobileHeader
    guards/               RequireAuth redirect
    ui/                   TaskCard, TaskPanel (+ task-panel/ subcomponents), RichTextEditor,
                          FilterDropdown, InlineDatePicker, ViewToggle, SourceIcon, TctmLogo,
                          EmptyState, LoadingSpinner
  pages/                  ActivePage, DonePage, ArchivePage, ReportedPage, SnoozedPage,
                          LoginPage, SettingsPage  (task detail opens in TaskPanel via /{bucket}/:taskId)
  pages/settings/         AuditLogPage, SourceThresholdsPage, EntityManagementPage,
                          MetricsPage, PromptsPage
  hooks/                  usePushNotifications, useInstallPrompt

packages/shared/src/      Shared TS types: TaskDto, TaskCounts, TaskBucket, TaskPriority,
                          RecurrencePattern, ExtractionSignals, etc.

cypress/                  E2E: login, inbox, review, today, task-detail, settings
```

## Task Model

Two states: **`pending`** | **`done`**. Organizational routing via **`bucket`**: `inbox` | `review` | `today` | `this_week` | `waiting_on` | `snoozed`.

Key fields: `priority` (high/mid/low), `dueAt`, `reminderAt`, `recurrence` (daily/weekly/monthly/custom), `parentTaskId` (subtasks), `archived` + `archivedAt`, `description` (HTML from rich text editor).

**Subtask auto-completion**: when all subtasks are `done`, parent auto-completes.
**Recurrence**: completing a recurring task clones it with `dueAt` advanced + subtasks reset.
**Dismiss = archive**: `archived: true`, not a status change.

## Extraction Pipeline

```
Signal (webhook/poll) → BullMQ signals.extract queue
  → ExtractorService (Opus, prompt from DB, entity glossary injected)
  → JudgeService (Haiku, adversarial QC: KEEP/REVIEW/DISMISS)
  → Threshold routing (per-sub-source multi-axis checks)
  → Dedup hash (16-char SHA, 7-day window)
  → TasksService.createFromExtraction (bucket=inbox|review, or archived if dismissed)
  → Push notification
```

## Prompt Versioning

Prompts live in `prompt_versions` table, not in code. Each has a `purpose` (extract/judge/snooze/resolve), auto-incrementing `version`, and `active` flag.

- `PromptsService.getActivePrompt(purpose)` — cached 5min
- Extractor/Judge load from DB, template vars replaced at runtime: `{{PARTNER_NAME}}`, `{{PARTNER_ROLE}}`, `{{ENTITY_GLOSSARY}}`
- `llm_audit_log.promptVersionId` links every call to its prompt version
- Calibration cron (Sunday 9am): reads `extraction_feedback` → Opus analysis → creates inactive draft version with suggested edits
- Admin activates via `/settings/prompts` UI or `POST /api/prompts/:id/activate`

## Key Conventions

- **Primary keys**: all tables use 8-char base36 nanoids (e.g. `uxfvcpkl`), **not** UUIDs — generated app-side via `apps/api/src/utils/nanoid.ts`. In the schema, use the `pk()` / `fk(name)` helpers in `db/schema/index.ts` (both `varchar(8)`); never reintroduce `uuid()`/`defaultRandom()`. Singleton/config tables keep their semantic `text` PKs (`source`, `provider`, `'singleton'`).
- **Global prefix**: `/api` in `main.ts`. Controllers use relative paths: `@Controller('tasks')`.
- **Auth**: Google Sign-In only (single-tenant). Backend verifies Google ID tokens via `google-auth-library`, requires `email_verified=true` and a case-insensitive match against `ALLOWED_GOOGLE_EMAIL`, then issues a 24h JWT. `AuthGuard` is global; `@Public()` bypasses JWT for webhooks. Sliding refresh: `RefreshInterceptor` attaches `X-Refresh-Token` + `X-Refresh-Expires` headers when the access token is within 6h of expiry; the web client picks them up in its base query and updates `authSlice`.
- **Webhook security**: Slack = HMAC, Gmail = Pub/Sub JWT, Notion = HMAC. Each verifies in controller.
- **Static serving**: production NestJS serves `apps/web/dist` via `ServeStaticModule`. Dev: Vite :3000 proxies to :4000.
- **Tests**: every module has `.spec.ts` (Jest) or `.test.tsx` (Vitest). Update all 3 suites on contract changes.
- **Styling**: Tailwind v4, dark mode default, 44px min touch targets, mobile-first single column.

## Testing

```bash
npm run test:api              # Jest — 27 suites, 146 tests
npm run test:web              # Vitest — 8 suites, 29 tests
npm run test:e2e              # Cypress — 6 spec files
```

Type-check: `cd apps/api && npx tsc --noEmit` and `cd apps/web && npx tsc --noEmit`

## BullMQ Queues

Defined in `apps/api/src/shared/queues.module.ts`:
- `signals.extract` — main extraction pipeline (concurrency 3, 3 retries exponential)
- `tasks.dedupe` — task dedup (2 retries)
- `waiting_on.resolve` — auto-resolution (2 retries)
- `gmail.watch.renew` — daily watch renewal (5 retries)
- `granola.poll` — 30s repeatable polling (2 retries)

## Environment Variables

See `apps/api/.env.example` for full list. Critical ones:
- `JWT_SECRET` — signs the access token after Google verification
- `GOOGLE_CLIENT_ID` — Web-app OAuth client; used for BOTH Google Sign-In (ID-token verification) and Gmail/Drive scopes
- `ALLOWED_GOOGLE_EMAIL` — the single email permitted to sign in (case-insensitive)
- `VITE_GOOGLE_CLIENT_ID` (web) — same value as `GOOGLE_CLIENT_ID`
- `ANTHROPIC_API_KEY` — LLM calls
- `DATABASE_URL` — Postgres connection
- `REDIS_URL` (Heroku) or `REDIS_HOST`/`REDIS_PORT` (local) — BullMQ + cache
- `PARTNER_NAME`, `PARTNER_ROLE` — injected into extraction prompts
- `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `PARTNER_SLACK_USER_ID` — Slack integration
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — web push
- `GOOGLE_CLIENT_SECRET` — secret for the Gmail/Drive OAuth flow (pairs with `GOOGLE_CLIENT_ID` above)

## Security Policy

This system handles LP communications, board materials, active deal terms, and NDA-protected content. **A breach is career-ending.** Zero tolerance for vulnerabilities.

- **`npm audit`** must be run after every dependency change. Fix everything — no exceptions.
- **Webhook verification**: every inbound endpoint verifies signatures (Slack HMAC, Gmail JWT, Notion HMAC). Never accept unverified payloads.
- **Secrets**: never in code or `.env` in production. Heroku config vars only. `.env` is dev-only and `.gitignore`d.
- **Auth**: Google Sign-In gated by `ALLOWED_GOOGLE_EMAIL`. ID tokens verified via `google-auth-library` with audience check. Issued JWT expires in 24h; sliding refresh issues a new token via `X-Refresh-Token` header when within 6h of expiry — no separate refresh-token storage, no revocation list.
- **LLM data**: Anthropic API set to zero-retention. Audit log stores I/O snapshots locally for debugging but redact before sending to external observability.
- **Network**: Heroku handles HTTPS termination. App trusts proxy headers (`trustProxy: true`).
- **Dependencies**: keep up to date. Run `npm audit` regularly. If a transitive dep has a vulnerability that can't be fixed upstream, use `overrides` in `package.json`.
- **Accepted residual risk** (4 moderate findings, all the same root cause): `drizzle-kit` (CLI used only locally for `db:generate`/`db:studio`/`db:migrate`) still pulls the unmaintained `@esbuild-kit/esm-loader`, which pins esbuild ≤0.24.2 (GHSA-67mh-4wv8-2f99 — esbuild's dev server allows arbitrary websites to read responses). npm overrides don't penetrate the nested `node_modules/@esbuild-kit/core-utils/node_modules/esbuild` install. Exploit requires visiting a malicious site while drizzle-kit is actively running its dev server — not the case during normal use. Not runtime, not production. Revisit when drizzle-kit drops `@esbuild-kit/esm-loader` upstream.

## Deployment (Heroku)

```bash
heroku create your-app-name
heroku stack:set container               # use Dockerfile
heroku addons:create heroku-postgresql:essential-0
heroku addons:create heroku-redis:mini

# Set config vars
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(openssl rand -hex 32)
heroku config:set GOOGLE_CLIENT_ID='...apps.googleusercontent.com'
heroku config:set ALLOWED_GOOGLE_EMAIL='partner@example.com'
heroku config:set ANTHROPIC_API_KEY=sk-ant-...
heroku config:set PARTNER_NAME="Your Name"
heroku config:set PARTNER_ROLE="Your Role"

git push heroku main
```

`DATABASE_URL` and `REDIS_URL` are set automatically by the addons. Migrations run on container boot via the Dockerfile CMD.

## Common Patterns

- **Adding a new source**: Create `ingestion/<source>/` with module, controller (`@Public()`), service. Register in `AppModule`. Add sub-source thresholds to `seed.ts`.
- **Changing extraction behavior**: Edit the active prompt via `/settings/prompts` or create a new version in `prompt_versions` table. Do NOT edit `prompts.ts` directly.
- **Adding a new task field**: Update schema → shared types → tasks service → tasks controller → RTK Query api.ts → TaskCard/TaskDetailPage → tests.
- **Modifying thresholds**: Edit via `/settings/thresholds` UI or `PATCH /api/source-config/:source`. No redeploy needed.
