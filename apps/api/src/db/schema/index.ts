import { pgTable, varchar, text, jsonb, timestamp, boolean, pgEnum, integer, index, uniqueIndex, real } from 'drizzle-orm/pg-core';
import { generateId } from '../../utils/nanoid';

// All primary keys are 8-char base36 nanoids (see utils/nanoid.ts). `pk()` is the
// id column; `fk(name)` is a reference column of the same shape.
const pk = () => varchar('id', { length: 8 }).$defaultFn(() => generateId()).primaryKey();
const fk = (name: string) => varchar(name, { length: 8 });

// ============================================================================
// ENUMS
// ============================================================================

export const sourceEnum = pgEnum('source', ['gmail', 'slack', 'notion', 'granola']);

export const signalStatusEnum = pgEnum('signal_status', [
  'pending',     // queued for extraction
  'extracted',   // produced tasks
  'no_task',     // judged as not containing a task
  'failed',      // extraction errored
  'skipped',     // filtered out before extraction (e.g., automated email)
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'done',
]);

// Agent (pipeline) verdict — independent of the user lifecycle (status/archived/reported/snooze).
// NULL = manually-created task (no agent verdict). 'dismissed' = auto-hidden by the judge (Filtered view).
export const taskTriageEnum = pgEnum('task_triage', [
  'keep',       // confident — shows in Active
  'review',     // lower-confidence / judge REVIEW — also shows in Active (user reports non-tasks)
  'dismissed',  // judge DISMISS — hidden from Active, surfaced only in the Filtered view
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'high',
  'mid',
  'low',
  'none',
]);

export const entityTypeEnum = pgEnum('entity_type', [
  'person',
  'company',
  'fund',
  'deal',
]);

export const feedbackActionEnum = pgEnum('feedback_action', [
  'accepted',
  'edited',
  'dismissed',
  'snoozed_indefinitely',
  'auto_resolved', // waiting_on cleared by incoming signal
]);

// ============================================================================
// ENTITIES — people, companies, funds, deals the partner cares about
// ============================================================================

export const entities = pgTable('entities', {
  id: pk(),
  type: entityTypeEnum('type').notNull(),
  canonicalName: text('canonical_name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  context: text('context'),  // free-form: "Lead investor on Acme Series B, partner: Roelof"
  emails: jsonb('emails').$type<string[]>().notNull().default([]),
  slackIds: jsonb('slack_ids').$type<string[]>().notNull().default([]),
  notionId: text('notion_id'),
  lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  typeIdx: index('entities_type_idx').on(t.type),
  canonicalNameIdx: index('entities_canonical_name_idx').on(t.canonicalName),
}));

// ============================================================================
// SIGNALS — normalized inbound events from any source
// ============================================================================

export const signals = pgTable('signals', {
  id: pk(),
  source: sourceEnum('source').notNull(),
  subSource: text('sub_source'),  // 'slack_dm', 'slack_channel', 'gmail_vip', etc.
  externalId: text('external_id').notNull(),  // upstream message/note ID
  dedupKey: text('dedup_key').notNull(),       // `${source}:${externalId}`
  status: signalStatusEnum('status').notNull().default('pending'),

  payload: jsonb('payload').$type<{
    title: string;
    body: string;
    author?: { name?: string; email?: string; externalId?: string };
    participants?: Array<{ name?: string; email?: string; externalId?: string }>;
    url?: string;
    threadId?: string;
    occurredAt: string;
    raw: unknown;
  }>().notNull(),

  // populated during extraction
  extractionAttempts: integer('extraction_attempts').notNull().default(0),
  lastError: text('last_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (t) => ({
  dedupKeyUnique: uniqueIndex('signals_dedup_key_unique').on(t.dedupKey),
  sourceStatusIdx: index('signals_source_status_idx').on(t.source, t.status),
  createdAtIdx: index('signals_created_at_idx').on(t.createdAt),
}));

// ============================================================================
// TASKS — the actual to-dos
// ============================================================================

export const tasks = pgTable('tasks', {
  id: pk(),
  title: text('title').notNull(),
  description: text('description'),  // supports HTML from rich text editor
  status: taskStatusEnum('status').notNull().default('pending'),
  priority: taskPriorityEnum('priority').notNull().default('none'),
  source: text('source'),  // 'gmail', 'slack', 'notion', 'granola', or null for manual

  // Source provenance for "View source" / "Sent by" on the task. url is a usable permalink for
  // slack/granola/notion; for gmail (dropbox) it's omitted and only sentBy.email is shown.
  sourceMeta: jsonb('source_meta').$type<{
    url?: string;
    sentBy?: { name?: string; email?: string };
  }>(),

  dueAt: timestamp('due_at', { withTimezone: true }),
  reminderAt: timestamp('reminder_at', { withTimezone: true }),

  // Subtask hierarchy
  parentTaskId: fk('parent_task_id').references((): any => tasks.id, { onDelete: 'cascade' }),

  // Recurrence
  recurrence: jsonb('recurrence').$type<{
    pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
    interval?: number;       // e.g., every 2 weeks
    daysOfWeek?: number[];   // 0=Sun..6=Sat, for weekly
    nextDueAt?: string;      // ISO 8601
  }>(),

  entityIds: jsonb('entity_ids').$type<string[]>().notNull().default([]),
  sourceSignalIds: jsonb('source_signal_ids').$type<string[]>().notNull().default([]),

  // For waiting_on tasks — who we're waiting on (entity IDs)
  waitingOnEntityIds: jsonb('waiting_on_entity_ids').$type<string[]>().notNull().default([]),

  // Extraction provenance — always shown in UI for trust
  extraction: jsonb('extraction').$type<{
    sourceQuote: string;
    confidence: number;
    signals: {
      explicitness: number;
      actionability: number;
      addressedToUser: number;
      entityMatchConfidence: number;
      temporalClarity: number;
    };
    ambiguityFlags: string[];
    judge?: {
      verdict: 'KEEP' | 'REVIEW' | 'DISMISS';
      reason: string;
    };
    extractorModel: string;
    judgeModel?: string;
    extractedAt: string;
  }>(),

  autoCreated: boolean('auto_created').notNull().default(false),

  // Agent verdict (keep/review/dismissed); NULL for manually-created tasks. See taskTriageEnum.
  triage: taskTriageEnum('triage'),

  // Dedup hash for cross-signal task collapsing
  dedupHash: text('dedup_hash'),

  // Archive (valid tasks put away by user)
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),

  // Reported (bad extractions flagged by user)
  reported: boolean('reported').notNull().default(false),
  reportedAt: timestamp('reported_at', { withTimezone: true }),
  reportReason: text('report_reason'),

  completedAt: timestamp('completed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx: index('tasks_status_idx').on(t.status),
  priorityIdx: index('tasks_priority_idx').on(t.priority),
  dueAtIdx: index('tasks_due_at_idx').on(t.dueAt),
  dedupHashIdx: index('tasks_dedup_hash_idx').on(t.dedupHash),
  parentTaskIdIdx: index('tasks_parent_task_id_idx').on(t.parentTaskId),
  archivedIdx: index('tasks_archived_idx').on(t.archived),
  reportedIdx: index('tasks_reported_idx').on(t.reported),
  triageIdx: index('tasks_triage_idx').on(t.triage),
}));

// ============================================================================
// TASK NOTES — append-only notes per task
// ============================================================================

export const taskNotes = pgTable('task_notes', {
  id: pk(),
  taskId: fk('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  taskIdIdx: index('task_notes_task_id_idx').on(t.taskId),
  createdAtIdx: index('task_notes_created_at_idx').on(t.createdAt),
}));

// ============================================================================
// EXTRACTION FEEDBACK — every accept/edit/dismiss for learning
// ============================================================================

export const extractionFeedback = pgTable('extraction_feedback', {
  id: pk(),
  taskId: fk('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  signalId: fk('signal_id').references(() => signals.id),
  action: feedbackActionEnum('action').notNull(),
  reason: text('reason'),  // optional dismissal/edit reason
  extractionSnapshot: jsonb('extraction_snapshot').notNull(),
  wasAutoCreated: boolean('was_auto_created').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  taskIdIdx: index('feedback_task_id_idx').on(t.taskId),
  actionCreatedAtIdx: index('feedback_action_created_at_idx').on(t.action, t.createdAt),
}));

// ============================================================================
// SOURCE CONFIG — per-source thresholds, tunable without redeploy
// ============================================================================

export const sourceConfig = pgTable('source_config', {
  source: text('source').primaryKey(),  // 'gmail', 'slack_dm', 'slack_channel', etc.
  enabled: boolean('enabled').notNull().default(true),
  thresholds: jsonb('thresholds').$type<{
    autoCreate: {
      explicitness: number;
      actionability: number;
      addressedToUser: number;
      overallConfidence: number;
    };
    skipBelow: {
      explicitness: number;
      actionability: number;
    };
  }>().notNull(),
  filters: jsonb('filters').$type<{
    includeLabels?: string[];
    excludeFromDomains?: string[];
    includeChannels?: string[];
    [key: string]: unknown;
  }>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// OAUTH TOKENS — encrypted refresh tokens for source APIs
// ============================================================================

export const oauthTokens = pgTable('oauth_tokens', {
  provider: text('provider').primaryKey(),  // 'gmail', 'slack', 'notion'
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  encryptedAccessToken: text('encrypted_access_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scope: text('scope'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// GMAIL WATCH STATE — for Pub/Sub history sync
// ============================================================================

export const gmailWatchState = pgTable('gmail_watch_state', {
  id: text('id').primaryKey().default('singleton'),  // single row
  historyId: text('history_id').notNull(),
  watchExpiresAt: timestamp('watch_expires_at', { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// GRANOLA POLL STATE
// ============================================================================

export const granolaPollState = pgTable('granola_poll_state', {
  id: text('id').primaryKey().default('singleton'),
  lastPolledAt: timestamp('last_polled_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenNoteId: text('last_seen_note_id'),
});

// ============================================================================
// AUDIT LOG — every LLM call, for trust + debugging
// ============================================================================

export const llmAuditLog = pgTable('llm_audit_log', {
  id: pk(),
  signalId: fk('signal_id').references(() => signals.id),
  taskId: fk('task_id').references(() => tasks.id),
  purpose: text('purpose').notNull(),  // 'extract', 'judge', 'snooze_parse', etc.
  promptVersionId: fk('prompt_version_id').references(() => promptVersions.id),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cacheReadTokens: integer('cache_read_tokens'),
  cacheCreationTokens: integer('cache_creation_tokens'),
  promptHash: text('prompt_hash'),  // sha256 of full prompt for grouping
  inputSnapshot: jsonb('input_snapshot'),
  outputSnapshot: jsonb('output_snapshot'),
  latencyMs: integer('latency_ms'),
  costUsd: real('cost_usd'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  signalIdIdx: index('llm_audit_signal_id_idx').on(t.signalId),
  purposeCreatedAtIdx: index('llm_audit_purpose_created_at_idx').on(t.purpose, t.createdAt),
}));

// ============================================================================
// PROMPT VERSIONS — versioned LLM prompts, tunable without redeploy
// ============================================================================

export const promptPurposeEnum = pgEnum('prompt_purpose', [
  'extract',    // task extraction (Opus)
  'judge',      // adversarial QC (Haiku)
  // 'snooze'/'resolve' are retained as enum members only — Postgres can't cheaply drop enum values.
  // Snooze (NL date parsing) and waiting-on resolution use inline prompts in their services with
  // purpose='classify', not DB-driven prompt versions. Not seeded; not surfaced in the Prompts UI.
  'snooze',
  'resolve',
]);

export const promptVersions = pgTable('prompt_versions', {
  id: pk(),
  purpose: promptPurposeEnum('purpose').notNull(),
  version: integer('version').notNull(),
  content: text('content').notNull(),           // full prompt template
  active: boolean('active').notNull().default(false),
  metadata: jsonb('metadata').$type<{
    createdBy?: string;         // 'seed' | 'calibration' | 'manual'
    reason?: string;            // why this version was created
    calibrationReportId?: string;
    diff?: string;              // human-readable diff from previous
  }>().notNull().default({}),
  performance: jsonb('performance').$type<{
    precision?: number;
    recall?: number;
    falsePositiveRate?: number;
    sampleSize?: number;
    measuredAt?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  purposeActiveIdx: index('prompt_versions_purpose_active_idx').on(t.purpose, t.active),
  purposeVersionIdx: uniqueIndex('prompt_versions_purpose_version_idx').on(t.purpose, t.version),
}));

// ============================================================================
// PUSH SUBSCRIPTIONS — web push notification endpoints
// ============================================================================

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: pk(),
  endpoint: text('endpoint').notNull(),
  keysP256dh: text('keys_p256dh').notNull(),
  keysAuth: text('keys_auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  endpointIdx: uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
}));
