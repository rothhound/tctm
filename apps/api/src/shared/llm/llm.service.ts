import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import { LlmProvider, LlmProviderName, LlmPurpose, LlmRequest, LlmResponse } from './llm.types';

/**
 * Single seam for all LLM calls. Picks the active provider from LLM_PROVIDER (default anthropic)
 * so the backend can be swapped with one env var and no code changes. Every caller goes through
 * `complete()`; `modelFor()` exposes the active model id for audit/metadata.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider: LlmProvider;

  constructor(config: ConfigService, anthropic: AnthropicProvider, openai: OpenAiProvider) {
    const selected = (config.get<string>('LLM_PROVIDER', 'anthropic') ?? 'anthropic').trim().toLowerCase();
    if (selected !== 'openai' && selected !== 'anthropic') {
      this.logger.warn(`Unknown LLM_PROVIDER="${selected}", defaulting to anthropic`);
    }
    this.provider = selected === 'openai' ? openai : anthropic;

    if (!this.provider.available) {
      this.logger.warn(
        `LLM provider "${this.provider.name}" is selected but its API key is missing — LLM calls will fail until it's configured.`,
      );
    } else {
      this.logger.log(
        `LLM provider: ${this.provider.name} ` +
          `(extract=${this.provider.modelFor('extract')}, judge=${this.provider.modelFor('judge')}, ` +
          `classify=${this.provider.modelFor('classify')})`,
      );
    }
  }

  get providerName(): LlmProviderName {
    return this.provider.name;
  }

  modelFor(purpose: LlmPurpose): string {
    return this.provider.modelFor(purpose);
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const res = await this.provider.complete(req);
    const ms = Date.now() - startedAt;

    // One readable line per AI call: what ran, on which model, how big, how long, how much.
    this.logger.log(
      `${req.purpose}${req.label ? ` [${req.label}]` : ''} → ${res.provider}/${res.model} · ` +
        `${res.usage.inputTokens}→${res.usage.outputTokens} tok` +
        `${res.usage.cacheReadTokens ? ` (cache ${res.usage.cacheReadTokens})` : ''} · ` +
        `${(ms / 1000).toFixed(1)}s · $${res.costUsd.toFixed(4)}`,
    );
    return res;
  }
}
