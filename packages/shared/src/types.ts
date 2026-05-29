// Task statuses — only two states
export type TaskStatus = 'pending' | 'done';

// Organizational buckets — where a pending task lives in the UI
export type TaskBucket = 'inbox' | 'review' | 'today' | 'this_week' | 'waiting_on' | 'snoozed';

export type TaskPriority = 'high' | 'mid' | 'low' | 'none';

export type TaskType = 'do' | 'reply' | 'review' | 'decide' | 'intro' | 'waiting_on';

export type SignalSource = 'gmail' | 'slack' | 'notion' | 'granola';

export type SubSource =
  | 'slack_dm'
  | 'slack_channel'
  | 'slack_reaction'
  | 'gmail_vip'
  | 'gmail_cold'
  | 'notion_mention'
  | 'notion_assigned'
  | 'granola';

export type EntityType = 'person' | 'company' | 'fund' | 'deal';

// Recurrence pattern
export interface RecurrencePattern {
  pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval?: number;
  daysOfWeek?: number[];
  nextDueAt?: string;
}

// Extraction confidence signals
export interface ExtractionSignals {
  explicitness: number;
  actionability: number;
  addressedToUser: number;
  entityMatchConfidence: number;
  temporalClarity: number;
}

// Judge verdict
export interface JudgeVerdict {
  verdict: 'KEEP' | 'REVIEW' | 'DISMISS';
  reason: string;
}

// Task extraction metadata (stored as jsonb)
export interface TaskExtraction {
  sourceQuote: string;
  confidence: number;
  signals: ExtractionSignals;
  ambiguityFlags: string[];
  judge?: JudgeVerdict;
  extractorModel: string;
  judgeModel?: string;
  extractedAt: string;
}

export interface TaskNoteDto {
  id: string;
  taskId: string;
  content: string;
  createdAt: string;
}

// API response shape for a task
export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  type: TaskType;
  status: TaskStatus;
  bucket: TaskBucket;
  priority: TaskPriority;
  source: string | null;
  dueAt: string | null;
  snoozeUntil: string | null;
  reminderAt: string | null;
  parentTaskId: string | null;
  recurrence: RecurrencePattern | null;
  entityIds: string[];
  sourceSignalIds: string[];
  waitingOnEntityIds: string[];
  extraction: TaskExtraction | null;
  reviewRequired: boolean;
  autoCreated: boolean;
  dedupHash: string | null;
  archived: boolean;
  archivedAt: string | null;
  reported: boolean;
  reportedAt: string | null;
  reportReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Report reasons — predefined options for bad extraction feedback
export const REPORT_REASONS = [
  'not_a_task',
  'duplicate',
  'wrong_priority',
  'wrong_person',
  'already_done',
  'irrelevant',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  not_a_task: 'Not a task',
  duplicate: 'Duplicate of another task',
  wrong_priority: 'Wrong priority or classification',
  wrong_person: 'Not addressed to me',
  already_done: 'Already completed',
  irrelevant: 'Irrelevant or noise',
  other: 'Other',
};

// Badge counts — by bucket
export interface TaskCounts {
  pending: number;
  done: number;
  total: number;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Entity DTO
export interface EntityDto {
  id: string;
  type: EntityType;
  canonicalName: string;
  aliases: string[];
  context: string | null;
  emails: string[];
  slackIds: string[];
  notionId: string | null;
}

// Auth
export interface LoginResponse {
  token: string;
  expiresAt: string;
}
