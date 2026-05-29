import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { z } from 'zod';
import { ANTHROPIC, MODELS } from '../shared/anthropic.module';
import { DB, DbType } from '../db/db.module';
import { llmAuditLog, signals } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ExtractionResult } from './types';
import { EntitiesService } from '../entities/entities.service';
import { PromptsService } from '../prompts/prompts.service';

// Zod schema for output validation. Parse defensively — LLM output is not trusted.
const ExtractedTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).default(''),
  type: z.enum(['do', 'reply', 'review', 'decide', 'intro', 'waiting_on']),
  dueAtIso: z.string().optional(),
  entityRefs: z.array(z.object({
    mention: z.string(),
    entityId: z.string().optional(),
  })).default([]),
  waitingOnEntityRefs: z.array(z.object({
    mention: z.string(),
    entityId: z.string().optional(),
  })).optional(),
  sourceQuote: z.string().min(1).max(1000),
  signals: z.object({
    explicitness: z.number().min(0).max(1),
    actionability: z.number().min(0).max(1),
    addressedToUser: z.number().min(0).max(1),
    entityMatchConfidence: z.number().min(0).max(1),
    temporalClarity: z.number().min(0).max(1),
  }),
  overallConfidence: z.number().min(0).max(1),
  ambiguityFlags: z.array(z.string()).default([]),
});

const ExtractionResultSchema = z.object({
  tasks: z.array(ExtractedTaskSchema).default([]),
  noTask: z.boolean(),
  noTaskReason: z.string().optional(),
});

export interface ExtractInput {
  signalId: string;
  source: string;
  subSource?: string;
  authorName?: string;
  authorEmail?: string;
  participants?: Array<{ name?: string; email?: string }>;
  title: string;
  body: string;
  occurredAt: string;
  threadContextSummary?: string;
}

@Injectable()
export class ExtractorService {
  private readonly logger = new Logger(ExtractorService.name);

  constructor(
    @Inject(ANTHROPIC) private readonly anthropic: Anthropic,
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
    private readonly entities: EntitiesService,
    private readonly promptsService: PromptsService,
  ) {}

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    const startedAt = Date.now();

    const partnerName = this.config.getOrThrow<string>('PARTNER_NAME');
    const partnerRole = this.config.getOrThrow<string>('PARTNER_ROLE');
    const entityGlossaryXml = await this.entities.renderGlossaryXml();

    // Load prompt from DB (cached 5min)
    const promptVersion = await this.promptsService.getActivePrompt('extract');
    const systemPrompt = promptVersion.content
      .replace('{{PARTNER_NAME}}', partnerName)
      .replace('{{PARTNER_ROLE}}', partnerRole)
      .replace('{{ENTITY_GLOSSARY}}', entityGlossaryXml);

    const userContent = JSON.stringify({
      source: input.source,
      subSource: input.subSource,
      author: { name: input.authorName, email: input.authorEmail },
      participants: input.participants ?? [],
      title: input.title,
      body: input.body,
      occurredAt: input.occurredAt,
      threadContextSummary: input.threadContextSummary,
    }, null, 2);

    const response = await this.anthropic.messages.create({
      model: MODELS.EXTRACTOR,
      max_tokens: 2000,
      // Prompt caching: system prompt is large and stable (changes ~daily when entities update).
      // Cache write happens once per day; subsequent calls are ~90% cheaper.
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userContent }],
    });

    const latencyMs = Date.now() - startedAt;
    const text = response.content.find(b => b.type === 'text')?.type === 'text'
      ? (response.content.find(b => b.type === 'text') as Anthropic.TextBlock).text
      : '';

    const cleaned = text.replace(/```json|```/g, '').trim();
    let result: ExtractionResult;
    try {
      const parsed = JSON.parse(cleaned);
      result = ExtractionResultSchema.parse(parsed);
    } catch (err) {
      this.logger.error(`Extraction parse failed for signal ${input.signalId}: ${(err as Error).message}`);
      this.logger.error(`Raw output: ${text.slice(0, 500)}`);
      throw new Error(`Invalid extractor output: ${(err as Error).message}`);
    }

    // Audit log — always, for trust and debugging
    await this.db.insert(llmAuditLog).values({
      signalId: input.signalId,
      purpose: 'extract',
      promptVersionId: promptVersion.id,
      model: MODELS.EXTRACTOR,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      promptHash: createHash('sha256').update(systemPrompt).digest('hex').slice(0, 16),
      inputSnapshot: { user: userContent.slice(0, 5000) },
      outputSnapshot: result,
      latencyMs,
      costUsd: this.estimateCostUsd(response.usage),
    });

    return result;
  }

  private estimateCostUsd(usage: Anthropic.Usage): number {
    // Opus 4.7 pricing — verify against current rates before relying on this number
    const INPUT_PER_MTOK = 15;
    const OUTPUT_PER_MTOK = 75;
    const CACHE_READ_PER_MTOK = 1.5;
    const CACHE_WRITE_PER_MTOK = 18.75;

    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const regularInput = usage.input_tokens - cacheRead;

    return (
      (regularInput * INPUT_PER_MTOK +
        cacheRead * CACHE_READ_PER_MTOK +
        cacheWrite * CACHE_WRITE_PER_MTOK +
        usage.output_tokens * OUTPUT_PER_MTOK) /
      1_000_000
    );
  }
}
