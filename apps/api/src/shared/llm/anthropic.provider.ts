import { Inject, Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC, MODELS } from '../anthropic.module';
import { LlmProvider, LlmPurpose, LlmRequest, LlmResponse, LlmUsage } from './llm.types';

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} // USD per 1M tokens

// Verify against current rates before relying on these numbers. Keyed by model id — JUDGE and
// CLASSIFIER are the same Haiku model, so the single Haiku entry covers both.
const PRICING: Record<string, Price> = {
  [MODELS.EXTRACTOR]: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 }, // Opus 4.7
  [MODELS.JUDGE]: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }, // Haiku 4.5 (== CLASSIFIER)
};

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;

  constructor(@Inject(ANTHROPIC) private readonly client: Anthropic | null) {}

  get available(): boolean {
    return this.client !== null;
  }

  modelFor(purpose: LlmPurpose): string {
    switch (purpose) {
      case 'extract':
        return MODELS.EXTRACTOR;
      case 'judge':
        return MODELS.JUDGE;
      case 'classify':
        return MODELS.CLASSIFIER;
    }
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.client) throw new Error('Anthropic provider selected but ANTHROPIC_API_KEY is not set');
    const model = this.modelFor(req.purpose);

    const response = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      system: [
        {
          type: 'text',
          text: req.system,
          ...(req.cacheSystem ? { cache_control: { type: 'ephemeral' as const } } : {}),
        },
      ],
      messages: [{ role: 'user', content: req.user }],
    });

    const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
    const usage: LlmUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    return { text: textBlock?.text ?? '', provider: this.name, model, usage, costUsd: this.cost(model, usage) };
  }

  private cost(model: string, u: LlmUsage): number {
    const p = PRICING[model];
    if (!p) return 0;
    // Anthropic reports cached reads separately from input_tokens in this codebase's accounting.
    const regularInput = u.inputTokens - u.cacheReadTokens;
    return (
      (regularInput * p.input +
        u.cacheReadTokens * p.cacheRead +
        u.cacheCreationTokens * p.cacheWrite +
        u.outputTokens * p.output) /
      1_000_000
    );
  }
}
