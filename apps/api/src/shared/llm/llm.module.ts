import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AnthropicModule } from '../anthropic.module';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider, OPENAI } from './openai.provider';
import { LlmService } from './llm.service';

/**
 * Provider-agnostic LLM layer. Holds the Anthropic + OpenAI clients (each null when its key is
 * unset, so an OpenAI-only or Anthropic-only deployment boots cleanly) and exposes LlmService,
 * which dispatches to whichever provider LLM_PROVIDER selects.
 */
@Global()
@Module({
  imports: [ConfigModule, AnthropicModule],
  providers: [
    {
      provide: OPENAI,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('OPENAI_API_KEY');
        return apiKey ? new OpenAI({ apiKey }) : null;
      },
    },
    AnthropicProvider,
    OpenAiProvider,
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
