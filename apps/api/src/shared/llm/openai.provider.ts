import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmProvider, LlmPurpose, LlmRequest, LlmResponse, LlmUsage } from './llm.types';

/** DI token for the OpenAI client (null when OPENAI_API_KEY is unset). */
export const OPENAI = Symbol('OPENAI');

interface Price {
  input: number;
  output: number;
  cached: number;
} // USD per 1M tokens

// Best-effort pricing for the default models. Unknown / overridden models log cost as 0.
const PRICING: Record<string, Price> = {
  'gpt-4o': { input: 2.5, output: 10, cached: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cached: 0.075 },
  'gpt-4.1': { input: 2, output: 8, cached: 0.5 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cached: 0.1 },
};

@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly models: Record<LlmPurpose, string>;

  constructor(
    @Inject(OPENAI) private readonly client: OpenAI | null,
    config: ConfigService,
  ) {
    // Models are env-overridable to match whatever the account has access to.
    this.models = {
      extract: config.get<string>('OPENAI_MODEL_EXTRACTOR', 'gpt-4o'),
      judge: config.get<string>('OPENAI_MODEL_JUDGE', 'gpt-4o-mini'),
      classify: config.get<string>('OPENAI_MODEL_CLASSIFIER', 'gpt-4o-mini'),
    };
  }

  get available(): boolean {
    return this.client !== null;
  }

  modelFor(purpose: LlmPurpose): string {
    return this.models[purpose];
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.client) throw new Error('OpenAI provider selected but OPENAI_API_KEY is not set');
    const model = this.modelFor(req.purpose);

    // Chat Completions maps cleanly to the system+user shape these prompts use; the existing
    // fence-stripping JSON parsers in each caller handle the output identically across providers.
    const response = await this.client.chat.completions.create({
      model,
      max_completion_tokens: req.maxTokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });

    const u = response.usage;
    const cacheReadTokens = u?.prompt_tokens_details?.cached_tokens ?? 0;
    const usage: LlmUsage = {
      inputTokens: u?.prompt_tokens ?? 0,
      outputTokens: u?.completion_tokens ?? 0,
      cacheReadTokens,
      cacheCreationTokens: 0, // OpenAI does not bill cache writes
    };

    return {
      text: response.choices[0]?.message?.content ?? '',
      provider: this.name,
      model,
      usage,
      costUsd: this.cost(model, usage),
    };
  }

  private cost(model: string, u: LlmUsage): number {
    const p = PRICING[model];
    if (!p) return 0; // unknown/overridden model — cost logged as 0 (best-effort)
    // OpenAI's prompt_tokens INCLUDES cached tokens, so split them out for pricing.
    const uncached = Math.max(0, u.inputTokens - u.cacheReadTokens);
    return (uncached * p.input + u.cacheReadTokens * p.cached + u.outputTokens * p.output) / 1_000_000;
  }
}
