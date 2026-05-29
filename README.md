# Assistant — Task Capture & Triage Manager

Personal task extraction system for a VC managing partner. Automatically ingests signals from Gmail, Slack, Notion, and Granola; uses Claude AI to extract actionable tasks; surfaces them in a mobile-first PWA.

**Implementation guide**: See [`CLAUDE.md`](./CLAUDE.md) for directory map, conventions, and patterns.

## Architecture

```
Gmail / Slack / Notion / Granola
        ↓ (webhooks + polling)
    Signal Ingestion (verify, normalize, dedup)
        ↓
    BullMQ: signals.extract queue
        ↓
    Extraction Pipeline:
      1. Opus 4.7 → ExtractedTask[] (prompt loaded from DB, entity glossary injected)
      2. Haiku 4.5 judge → KEEP / REVIEW / DISMISS
      3. Per-sub-source threshold routing (multi-axis)
      4. Task-layer dedup (SHA hash, 7-day window)
      5. Persist with provenance → push notification
        ↓
    PWA (React, mobile-first)
      Inbox → Review → Today → This Week → Waiting On
```

## Stack

| Layer | Tech |
|-------|------|
| Backend | NestJS 11 (Fastify 5), Drizzle ORM, BullMQ, PostgreSQL 16, Redis 7 |
| Frontend | React 19, Vite 6, Tailwind v4, Redux Toolkit / RTK Query, PWA |
| LLM | Claude Opus 4.7 (extraction) + Haiku 4.5 (judge, snooze parse, resolution) |
| Hosting | AWS — EC2 t4g.small, RDS Postgres, CloudFront, Secrets Manager |
| Cost | ~$45/mo infra + ~$240/mo LLM = ~$285/mo |

## Local Development

Requires Postgres and Redis running locally.

```bash
npm install
cp apps/api/.env.example apps/api/.env  # fill in secrets
npm run db:setup                        # create DB + migrate + seed (first time)
npm run dev                             # Web :3000, API :4000
```

## Testing

```bash
npm run test:api          # Jest — backend (27 suites, 146 tests)
npm run test:web          # Vitest — frontend (8 suites, 29 tests)
npm run test:e2e          # Cypress — E2E (6 spec files)
```

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Single Signal abstraction | All sources normalize to one shape | Adding sources = controller only; cross-source dedup works |
| Opus extract + Haiku judge | Two-model pipeline | Opus for nuance, Haiku for cheap adversarial QC; two-stage > self-critique |
| Multi-axis confidence | 5 axes, not one number | Single LLM confidence is poorly calibrated; 5 axes catch 5 failure modes |
| Per-sub-source thresholds | `source_config` table | Slack DM vs channel have wildly different noise; tunable without redeploy |
| Prompt versioning in DB | `prompt_versions` table | Prompts evolve with feedback; version history enables rollback + performance comparison |
| Two-state task model | `pending`/`done` + `bucket` | Clean separation of completion state vs organizational routing |
| Subtask auto-completion | Parent auto-completes when all children done | Reduces manual tracking overhead |
| PWA over native | Web push on iOS 16.4+ | One codebase, no App Store, lower maintenance |
| Single-tenant JWT | Password → JWT, 24h expiry | Simplest secure auth for one user |

## Documentation

| File | Purpose |
|------|---------|
| [`CLAUDE.md`](./CLAUDE.md) | Implementation guide — directory map, conventions, patterns, how-tos |
| [`SPECIFICATION.md`](./SPECIFICATION.md) | Full system design spec — the source of truth |
| [`docs/decisions.md`](./docs/decisions.md) | Design decision log with rationale |
| [`docs/extraction-pipeline.md`](./docs/extraction-pipeline.md) | Worked examples of extraction + judge pipeline |
| [`docs/source-integrations.md`](./docs/source-integrations.md) | Per-source implementation details |
| [`docs/build-plan.md`](./docs/build-plan.md) | Phased work breakdown (Phases 1-5 complete) |
| [`infra/terraform/README.md`](./infra/terraform/README.md) | AWS provisioning guide |

## Project Status

V1 feature-complete. All 5 phases built:
- Phase 1: Foundation (auth, schema, monorepo)
- Phase 2: Slack end-to-end pipeline + core UI
- Phase 3: Quality (eval harness), notifications, audit log
- Phase 4: Gmail, Notion, Granola integrations + waiting-on auto-resolution
- Phase 5: Polish, settings UI, Cypress E2E, CI workflows

Post-V1 additions:
- Task model overhaul (priority, subtasks, recurrence, archive, two-state)
- Prompt versioning system with calibration feedback loop
