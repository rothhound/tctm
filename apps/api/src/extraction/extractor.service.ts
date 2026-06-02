import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { z } from 'zod';
import { LlmService } from '../shared/llm/llm.service';
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
  /** Partner explicitly flagged this for capture (Slack @tctm / 🎯) — must always yield a task. */
  explicitCapture?: boolean;
}

@Injectable()
export class ExtractorService {
  private readonly logger = new Logger(ExtractorService.name);

  constructor(
    private readonly llm: LlmService,
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
    private readonly entities: EntitiesService,
    private readonly promptsService: PromptsService,
  ) {}

  async extract(input: ExtractInput): Promise<ExtractionResult> {
    const startedAt = Date.now();

    const partnerName = this.config.getOrThrow<string>('PARTNER_NAME');
    const partnerRole = this.config.getOrThrow<string>('PARTNER_ROLE');
    // Same env as the Slack matchers — lets the prompt map the partner's aliases ("GF", "Gian") to "you".
    const aliases = (this.config.get<string>('PARTNER_ALIASES', '') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const partnerAliasesText = aliases.length ? aliases.join(', ') : '(none)';
    const entityGlossaryXml = await this.entities.renderGlossaryXml();

    // Load prompt from DB (cached 5min). Global replace — each placeholder appears multiple times.
    const promptVersion = await this.promptsService.getActivePrompt('extract');
    let systemPrompt = promptVersion.content
      .replace(/\{\{PARTNER_NAME\}\}/g, partnerName)
      .replace(/\{\{PARTNER_ROLE\}\}/g, partnerRole)
      .replace(/\{\{PARTNER_ALIASES\}\}/g, partnerAliasesText)
      .replace(/\{\{ENTITY_GLOSSARY\}\}/g, entityGlossaryXml);

    // Explicit capture override: the partner deliberately flagged this message (@tctm / 🎯), so the
    // normal "is this a task FOR the partner?" gate doesn't apply — they've already decided it is.
    // Without this, delegations ("X, please do Y") inconsistently return noTask.
    if (input.explicitCapture) {
      systemPrompt += `\n\n## EXPLICIT CAPTURE OVERRIDE\n${partnerName} explicitly flagged this message for capture. They have decided it is worth tracking, so you MUST return exactly one task with "noTask": false. If ${partnerName} is delegating to or instructing someone else, capture it as an oversight/follow-up task owned by ${partnerName} (e.g., "Follow up: <person> to <do X>"). Never return noTask for an explicit capture.`;
    }

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

    const completion = await this.llm.complete({
      purpose: 'extract',
      system: systemPrompt,
      user: userContent,
      maxTokens: 2000,
      // Prompt caching: system prompt is large and stable (changes ~daily when entities update).
      // Honored by Anthropic (cache write once/day, then ~90% cheaper); OpenAI caches automatically.
      cacheSystem: true,
    });

    const latencyMs = Date.now() - startedAt;
    const text = completion.text;

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
      model: completion.model,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      cacheReadTokens: completion.usage.cacheReadTokens,
      cacheCreationTokens: completion.usage.cacheCreationTokens,
      promptHash: createHash('sha256').update(systemPrompt).digest('hex').slice(0, 16),
      inputSnapshot: { user: userContent.slice(0, 5000) },
      outputSnapshot: result,
      latencyMs,
      costUsd: completion.costUsd,
    });

    return result;
  }
}
