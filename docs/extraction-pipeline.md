# Extraction Pipeline — Detailed Reference

This document expands on §5 of `SPECIFICATION.md` with concrete examples and decision tables. If anything here conflicts with the main spec, the main spec wins; raise a PR to fix.

## Walked example: a Gmail signal end-to-end

### Input: raw Gmail message

```
From: roelof.botha@sequoiacap.com
To: partner@firm.com
Date: 2026-05-19T14:32:00Z
Subject: Re: Acme term sheet

Hi Jane,

Thanks for the great call yesterday. Two quick things:

1. Could you send over the updated cap table by EOD Friday? We want
   to finalize numbers over the weekend.

2. Loop in your legal counsel — we'll need to sync with them on the
   redemption rights language.

Talk soon,
Roelof
```

### Step 1: ingestion → Signal

The Gmail Pub/Sub webhook fires, history sync pulls this message. The ingestion service:

1. Looks up the author email against the entity table → matches `ent_roelof_botha`
2. Subsource resolves to `gmail_vip` (author is a known entity)
3. Builds Signal:

```json
{
  "source": "gmail",
  "subSource": "gmail_vip",
  "externalId": "msg_19a8b7c6d5",
  "dedupKey": "gmail:msg_19a8b7c6d5",
  "status": "pending",
  "payload": {
    "title": "Re: Acme term sheet",
    "body": "Hi Jane, Thanks for the great call yesterday. Two quick things:\n\n1. Could you send over the updated cap table by EOD Friday?...",
    "author": { "name": "Roelof Botha", "email": "roelof.botha@sequoiacap.com" },
    "occurredAt": "2026-05-19T14:32:00Z",
    "url": "https://mail.google.com/mail/u/0/#inbox/msg_19a8b7c6d5",
    "threadId": "thread_abc123",
    "raw": { /* full Gmail message */ }
  }
}
```

### Step 2: extraction

The processor pulls the signal and the cached entity glossary, calls Claude Opus 4.7.

Output (validated by Zod):

```json
{
  "tasks": [
    {
      "title": "Send updated Acme cap table to Roelof Botha",
      "description": "Sequoia needs it by EOD Friday to finalize term sheet over the weekend",
      "type": "do",
      "dueAtIso": "2026-05-22T23:59:00-07:00",
      "entityRefs": [
        { "mention": "Roelof", "entityId": "ent_roelof_botha" },
        { "mention": "Acme", "entityId": "ent_acme" },
        { "mention": "Sequoia", "entityId": "ent_sequoia" }
      ],
      "sourceQuote": "Could you send over the updated cap table by EOD Friday?",
      "signals": {
        "explicitness": 0.95,
        "actionability": 0.95,
        "addressedToUser": 0.95,
        "entityMatchConfidence": 0.95,
        "temporalClarity": 0.9
      },
      "overallConfidence": 0.93,
      "ambiguityFlags": []
    },
    {
      "title": "Loop in legal counsel on Acme redemption rights",
      "description": "Sequoia needs to sync with legal on redemption rights language",
      "type": "do",
      "entityRefs": [
        { "mention": "legal counsel", "entityId": null },
        { "mention": "Acme", "entityId": "ent_acme" }
      ],
      "sourceQuote": "Loop in your legal counsel — we'll need to sync with them on the redemption rights language.",
      "signals": {
        "explicitness": 0.85,
        "actionability": 0.8,
        "addressedToUser": 0.9,
        "entityMatchConfidence": 0.6,
        "temporalClarity": 0.3
      },
      "overallConfidence": 0.75,
      "ambiguityFlags": ["no_deadline", "unresolved_entity_legal_counsel"]
    }
  ],
  "noTask": false
}
```

Two tasks extracted from one signal — this is normal and good.

### Step 3: judge (per task)

Task 1 goes to the judge with last-48h context. Output:

```json
{ "verdict": "KEEP", "reason": "Explicit ask from known VIP entity with clear deadline" }
```

Task 2 to the judge:

```json
{ "verdict": "KEEP", "reason": "Concrete ask from VIP; deadline implied by linked task 1" }
```

### Step 4: routing

For `gmail_vip` subsource, thresholds are:
- autoCreate: explicitness ≥ 0.75, actionability ≥ 0.75, addressedToUser ≥ 0.85, overallConfidence ≥ 0.75

Task 1: all thresholds met, no ambiguity flags → **inbox** (auto-created).

Task 2: thresholds met BUT `ambiguityFlags.length > 0` → **review_pending**.

This is correct behavior. Task 1 is unambiguous. Task 2 has an unresolved entity ("legal counsel" — who specifically?) and no deadline. The partner should glance at it to decide.

### Step 5: dedup check

For each task, compute dedup hash:

```
Task 1: sha256("send updated acme cap table to roelof botha|do|ent_acme,ent_roelof_botha,ent_sequoia").slice(0, 16)
     → "a3f1e9c2b8d7f0e4"
```

Query: any task with this hash in the last 7 days? No → insert as new.

### Step 6: persist

Task 1 inserted with `status='inbox'`, `autoCreated=true`, full extraction metadata.
Task 2 inserted with `status='review_pending'`, `reviewRequired=true`.

The partner's PWA shows:
- 🟡 **Inbox (1 new)** — "Send updated Acme cap table to Roelof Botha"
- 🔴 **Review (1 new)** — "Loop in legal counsel on Acme redemption rights"

## Counter-example: a signal that should NOT become a task

### Input

```
From: newsletter@stratechery.com
Subject: This week in tech

Aggregation theory revisited: how AI changes the equation...
```

### Step 1: ingestion

Author email doesn't match any entity → subsource is `gmail_cold`.

### Step 2: extraction

Claude returns:

```json
{ "tasks": [], "noTask": true, "noTaskReason": "Newsletter content, no action required" }
```

Signal is marked `status='no_task'` and processing ends. No LLM judge call. Cost: one Opus call (~$0.05).

### What if Claude got it wrong?

Say Claude over-fires and returns a task: "Read Aggregation theory article". The judge would see:
- Source is `gmail_cold`
- Author is unknown entity
- Task is "read" type from an unknown sender

Judge verdict: `DISMISS` ("Newsletter content, not actionable for partner"). Task lands in `dismissed` status — kept for audit but never shown.

## Edge cases and how the pipeline handles them

### Multiple signals about the same thing

Partner has a call with Acme's founder. Three signals arrive within 2 hours:

1. Gmail from founder: "Great talking. Will send the v3 deck this afternoon."
2. Granola note from the call: action item "Review v3 deck from Acme founder"
3. Slack DM from founder: "Just shared v3 in our Notion"

Three signals → three extraction runs → three "Review Acme v3 deck" tasks.

Dedup hash collision catches this: all three normalize to similar hash. Second and third signals merge into the first task's `sourceSignalIds`. Partner sees ONE task with three source links.

### LLM returns invalid JSON

Extractor service tries to parse. Zod schema fails. Exception thrown, BullMQ retries with exponential backoff. After 3 attempts, signal marked `status='failed'` with `lastError` populated. Operator monitors fail rate via dashboard.

### Entity glossary becomes stale mid-session

Cache TTL is 1 hour. Entities updated via UI invalidate the cache immediately (`entitiesService.invalidateGlossaryCache()`). Worst-case staleness: 1 hour, which is acceptable.

### Judge errors

Defaults to `REVIEW` verdict. Task goes to review queue rather than being auto-created or dismissed. This is fail-safe: a broken judge can never silently dismiss real tasks or flood with false positives.

### Extreme volume burst

Partner returns from a week of vacation. 1000 emails arrive. Pub/Sub delivers them all within minutes. BullMQ queues them.

Concurrency is set to 3 extractions in parallel. Throughput: ~3 signals/second → ~5 minutes to process 1000 signals.

Anthropic rate limit (~50 RPM for Opus) becomes binding. BullMQ retries with backoff handle 429s gracefully. Worst case: full processing in 30 minutes.

No human action needed; the partner sees their inbox populate as extraction completes.

## Threshold tuning checklist

When the partner says "too many false positives in inbox":

1. Pull last 7 days of dismissed auto-created tasks
2. Group by sub-source
3. The worst-performing sub-source gets thresholds raised:
   - `overallConfidence` += 0.05
   - One of (`explicitness`, `actionability`, `addressedToUser`) += 0.05 (whichever shows the most signal in dismissed examples)
4. Run shadow mode for 24h with new thresholds
5. Compare shadow output vs current output; commit if better

When the partner says "I'm seeing tasks in review that should have been auto":

1. Pull last 7 days of review-pending tasks that were accepted unchanged
2. If a clear pattern in ambiguityFlags exists, modify extractor prompt to be more decisive on that pattern
3. Otherwise, lower the relevant threshold by 0.05 and shadow-test

Never adjust thresholds by more than 0.05 at a time. Small changes, observe outcomes.

## When to update prompts vs thresholds

Threshold change: fast, no redeploy, reversible. First lever to try.

Prompt change: requires eval set re-run, code change, deploy. Use when:
- Same false-positive pattern appears regardless of threshold setting
- New task type or entity type needs handling
- A whole category of signal is consistently misclassified

Never both at once — you won't know which change had what effect.
