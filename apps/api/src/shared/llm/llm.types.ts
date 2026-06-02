export type LlmProviderName = 'anthropic' | 'openai';

/** The three model roles the app uses. Each provider maps these to a concrete model id. */
export type LlmPurpose = 'extract' | 'judge' | 'classify';

export interface LlmRequest {
  purpose: LlmPurpose;
  system: string;
  user: string;
  maxTokens: number;
  /** Optional sampling temperature. Omitted → the provider/model default. */
  temperature?: number;
  /**
   * Hint that the (large, stable) system prompt should be cached. Honored by Anthropic via
   * `cache_control`; OpenAI caches large prompts automatically, so it's a no-op there.
   */
  cacheSystem?: boolean;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface LlmResponse {
  text: string;
  provider: LlmProviderName;
  model: string;
  usage: LlmUsage;
  costUsd: number;
}

/** A swappable LLM backend. The active one is selected at runtime by the LLM_PROVIDER env var. */
export interface LlmProvider {
  readonly name: LlmProviderName;
  /** Whether this provider has the credentials it needs to run. */
  readonly available: boolean;
  /** Concrete model id for a role (used for audit/metadata). */
  modelFor(purpose: LlmPurpose): string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
