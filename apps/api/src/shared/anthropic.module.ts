import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC = Symbol('ANTHROPIC');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ANTHROPIC,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Anthropic({
          apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
        }),
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
