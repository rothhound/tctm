export type SignalSource = 'gmail' | 'slack' | 'notion' | 'granola';

export type TaskType = 'do' | 'reply' | 'review' | 'decide' | 'intro' | 'waiting_on';

export interface ExtractionSignals {
  explicitness: number;         // 0-1: was this literally asked of the user?
  actionability: number;        // 0-1: clear action vs vague intent
  addressedToUser: number;      // 0-1: directed at user vs cc'd/mentioned
  entityMatchConfidence: number; // 0-1: confidence in entity resolution
  temporalClarity: number;      // 0-1: clear deadline vs no time signal
}

export interface ExtractedTask {
  title: string;
  description: string;
  type: TaskType;
  dueAtIso?: string;
  entityRefs: Array<{
    mention: string;     // the literal text in the source
    entityId?: string;   // resolved ID, if found
  }>;
  waitingOnEntityRefs?: Array<{ mention: string; entityId?: string }>;
  sourceQuote: string;   // exact quote that justified extraction
  signals: ExtractionSignals;
  overallConfidence: number;
  ambiguityFlags: string[];
}

export interface ExtractionResult {
  tasks: ExtractedTask[];
  noTask: boolean;
  noTaskReason?: string;
}

export interface JudgeVerdict {
  verdict: 'KEEP' | 'REVIEW' | 'DISMISS';
  reason: string;
}
