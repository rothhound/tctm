# Decisions

A running log of design decisions. Each entry: date, decision, alternatives considered, rationale.

When you're tempted to change one of these, read the rationale first. If it still seems wrong, add a new entry that supersedes the old one. Don't edit history.

---

## 2026-05-19 — Single Signal abstraction, source-agnostic downstream

**Decision**: All inbound events from all sources are normalized to a single `Signal` shape before any processing. Extraction, judge, dedup, and persistence are source-agnostic.

**Alternatives**:
- Source-specific tables (`gmail_messages`, `slack_messages`, etc.) with per-source pipelines
- One signal table but per-source extraction pipelines

**Rationale**: Adding a new source becomes a controller + ingestion service. Everything downstream is free. Cross-source dedup ("the email and the Slack message about the same thing") works at the task layer because all signals look alike. Cost: per-source translation layer, ~50 lines per source. Worth it.

---

## 2026-05-19 — Claude Opus 4.7 for extract, Claude Haiku 4.5 for judge

**Decision**: Opus for the extraction pass, Haiku for the adversarial second pass.

**Alternatives**:
- Single Opus call that extracts and self-critiques
- Two Opus calls
- Two Haiku calls

**Rationale**: Opus is needed for nuanced extraction with entity context. Haiku is sufficient for the judge because the judge has structured input (the proposed task) and a binary-ish decision (KEEP/REVIEW/DISMISS). Two-stage is more robust than single-stage self-critique because the judge has fresh context and isn't anchored on the extractor's reasoning. Cost: Haiku adds ~$0.001/signal — negligible.

---

## 2026-05-19 — Multi-axis confidence over single threshold

**Decision**: Auto-create decision uses 4+ axes (explicitness, actionability, addressedToUser, overallConfidence) plus ambiguityFlags. Never a single `confidence > X` check.

**Alternatives**:
- Single overall confidence threshold
- Weighted scalar score

**Rationale**: LLM single-number confidence is poorly calibrated. Multi-axis checks catch failures like "high confidence but vague" or "explicit ask but addressed to someone else". The five axes correspond to five real failure modes; AND-ing them is much more robust.

---

## 2026-05-19 — Auto-create with judge for high-confidence, review for ambiguous

**Decision**: High-confidence + judge-approved → inbox (auto-created). Anything ambiguous or judge-rejected → review queue.

**Alternatives**:
- All tasks go to review queue
- No review queue, everything auto-creates
- Confidence-based fully without judge

**Rationale**: Approval fatigue kills these systems within a week — partners will not triage every extraction. But auto-creating false positives erodes trust. The hybrid: confidence routing handles the easy cases, judge catches the failure modes confidence misses, review queue handles the genuinely-ambiguous. Three layers because each catches a different class of error.

---

## 2026-05-19 — Per-sub-source thresholds, not per-source

**Decision**: Thresholds are configured per sub-source (`slack_dm`, `slack_channel`, `gmail_vip`, `gmail_cold`) not per source.

**Alternatives**:
- One threshold per top-level source
- Global thresholds

**Rationale**: A Slack DM and a Slack channel mention have wildly different precision profiles. Same with Gmail from a known partner vs. cold inbound. The sub-source distinction is where the actual decision lives.

---

## 2026-05-19 — Prompt caching with entity glossary in system prompt

**Decision**: System prompt for extraction includes the full entity glossary; cache it. Reset cache when entities update (max 1h TTL).

**Alternatives**:
- Glossary in user message (no caching benefit)
- Per-entity lookup table queried by Claude via tool use
- Top-N entities by recent interaction instead of full set

**Rationale**: Glossary is large (5k+ tokens) and stable. Caching cuts extraction cost by ~3x. Tool use would be slower and more complex. Top-N is a fallback if the entity table grows past ~5k entries; for v1 we don't need it.

---

## 2026-05-19 — AWS hosting, EC2 single-instance

**Decision**: Single EC2 t4g.small running Node + Redis + Caddy, with RDS Postgres and CloudFront in front.

**Alternatives**:
- Hetzner VPS (cheaper, $5/mo vs $50)
- Fly.io (easier deploys)
- AWS ECS Fargate (more "production")
- Lambda (serverless)

**Rationale**: Partner picked AWS. For a single-user app, the simplest AWS architecture (one EC2 + RDS) is far cheaper than container orchestration and gives most of the same benefits. Lambda's cold starts hurt webhook latency. Hetzner would be 10x cheaper but the partner wanted AWS for the unified billing/IAM story.

---

## 2026-05-19 — Drizzle ORM over TypeORM or Prisma

**Decision**: Drizzle for the data layer.

**Alternatives**:
- TypeORM (the partner's existing CIOP stack)
- Prisma
- Raw SQL with pg

**Rationale**: Drizzle has the best TS inference for `jsonb` columns, which we use heavily. Migrations are SQL-first, which keeps the schema readable in PR diffs. TypeORM works but fights you on jsonb types. Prisma's hosted control plane is overkill and adds friction. Raw SQL would be cleanest but no migrations tooling.

This is a divergence from the partner's CIOP stack (TypeORM). Justified because this is a new codebase with different requirements.

---

## 2026-05-19 — PWA over native iOS app

**Decision**: Single Vite + React PWA, installable to home screen, web push via VAPID.

**Alternatives**:
- Native iOS via Swift
- React Native
- Just a desktop web app

**Rationale**: One codebase. Web push works on iOS 16.4+. No App Store review cycle. Maintenance burden is far lower. The partner will use this on iPhone primarily; the PWA install on iPhone home screen is indistinguishable from a native app for the use cases we care about (notifications, swipe gestures, fullscreen).

---

## 2026-05-19 — No automated prompt or threshold tuning

**Decision**: Weekly calibration cron produces a *report*; the operator reads it and decides what changes to apply. Never auto-apply.

**Alternatives**:
- Auto-tune thresholds based on accept/dismiss patterns
- Auto-iterate prompts based on extraction failures

**Rationale**: Unattended self-modification of LLM systems drifts in hard-to-debug ways. The system should be steady and predictable. Tuning is a human decision informed by data, not an automated process.

---

## 2026-05-19 — Granola via polling, not webhooks

**Decision**: 30s cron polling of Granola Personal API.

**Alternatives**:
- Wait for Granola webhooks (on roadmap, no date)
- Zapier → Granola → our webhook
- Don't integrate Granola

**Rationale**: Granola doesn't ship webhooks yet. Notes are appended after meetings (not during), so 30s lag is invisible. Zapier adds a third-party dependency and cost. When Granola ships webhooks, swap the cron for a controller — the Signal layer doesn't care.

---

## 2026-05-19 — Approval inbox is "Inbox", review is separate

**Decision**: Two separate buckets. `inbox` holds auto-created tasks. `review_pending` holds tasks needing human judgment on whether they're tasks at all.

**Alternatives**:
- Single bucket, color-coded by source/confidence
- "Approve everything" model

**Rationale**: Mixing them creates the approval fatigue we explicitly want to avoid. The Inbox is triage ("pick a day"); Review is judgment ("is this real?"). Different cognitive load, different UI, separate badges.

---

## 2026-05-19 — Dedup at task layer with 16-char hash

**Decision**: After extraction, hash `(normalized_title + type + sorted_entity_ids)` to a 16-char SHA-256 prefix. Match against last 7 days; if hit, merge.

**Alternatives**:
- Dedup at signal layer (won't catch cross-source dupes)
- Semantic dedup via embeddings
- Don't dedup; let users see all
- Full hash, longer window

**Rationale**: The vast majority of dupes are same-day, same-entities, paraphrased differently. A hash on normalized content catches these cheaply. 7-day window catches "I haven't gotten to that task yet, but the founder Slacked me about it again". 16 chars is sufficient (2^64 space, single-user volume) and shorter for storage. Semantic dedup is a v2 enhancement if 16-char hash misses too much.

---

## Template for new entries

```
## YYYY-MM-DD — Short description

**Decision**: What we decided.

**Alternatives**: What else we considered.

**Rationale**: Why this won.
```

Add new entries at the top of the chronological section. If superseding an old decision, link to it and explain what changed.
