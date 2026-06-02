import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC = Symbol('ANTHROPIC');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      // Null when ANTHROPIC_API_KEY is unset, so the app can run on OpenAI alone. The Anthropic
      // LlmProvider surfaces a clear error if it's selected without a key.
      provide: ANTHROPIC,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
  exports: [ANTHROPIC],
})
export class AnthropicModule {}

// Model identifiers, centralized so they're easy to swap
export const MODELS = {
  EXTRACTOR: 'claude-opus-4-7',
  JUDGE: 'claude-haiku-4-5-20251001',
  CLASSIFIER: 'claude-haiku-4-5-20251001', // is-task quick classifier, snooze parsing, etc.
} as const;
