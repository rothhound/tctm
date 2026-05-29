import { Inject, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ANTHROPIC, MODELS } from '../shared/anthropic.module';
import { DB, DbType } from '../db/db.module';
import { llmAuditLog, tasks } from '../db/schema';
import { desc, gte } from 'drizzle-orm';
import { ExtractedTask, JudgeVerdict } from './types';
import { PromptsService } from '../prompts/prompts.service';

const JudgeVerdictSchema = z.object({
  verdict: z.enum(['KEEP', 'REVIEW', 'DISMISS']),
  reason: z.string().min(1).max(300),
});

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(
    @Inject(ANTHROPIC) private readonly anthropic: Anthropic,
    @Inject(DB) private readonly db: DbType,
    private readonly promptsService: PromptsService,
  ) {}

  /**
   * Second-pass adversarial check. Cheap (Haiku) but catches the failure modes that
   * extractor confidence alone misses: duplicates, FYIs, not-for-you content, etc.
   */
  async judge(task: ExtractedTask, signalId: string): Promise<JudgeVerdict> {
    const startedAt = Date.now();

    // Pull last 48h of tasks for duplicate detection context
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentTasks = await this.db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, createdAt: tasks.createdAt })
      .from(tasks)
      .where(gte(tasks.createdAt, since))
      .orderBy(desc(tasks.createdAt))
      .limit(20);

    const userContent = JSON.stringify({
      proposedTask: {
        title: task.title,
        description: task.description,
        type: task.type,
        sourceQuote: task.sourceQuote,
        signals: task.signals,
        overallConfidence: task.overallConfidence,
        ambiguityFlags: task.ambiguityFlags,
      },
      recentTasksLast48h: recentTasks.map(t => ({
        title: t.title,
        status: t.status,
        ageHours: Math.round((Date.now() - t.createdAt.getTime()) / 3_600_000),
      })),
    }, null, 2);

    // Load prompt from DB (cached 5min)
    const promptVersion = await this.promptsService.getActivePrompt('judge');

    const response = await this.anthropic.messages.create({
      model: MODELS.JUDGE,
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: promptVersion.content,
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
    let verdict: JudgeVerdict;
    try {
      verdict = JudgeVerdictSchema.parse(JSON.parse(cleaned));
    } catch (err) {
      // Fail-open with REVIEW — never auto-dismiss on judge error
      this.logger.error(`Judge parse failed: ${(err as Error).message}, raw: ${text.slice(0, 200)}`);
      verdict = { verdict: 'REVIEW', reason: 'Judge output invalid, defaulting to review' };
    }

    await this.db.insert(llmAuditLog).values({
      signalId,
      purpose: 'judge',
      promptVersionId: promptVersion.id,
      model: MODELS.JUDGE,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      inputSnapshot: { user: userContent.slice(0, 3000) },
      outputSnapshot: verdict,
      latencyMs,
      costUsd: this.estimateCostUsd(response.usage),
    });

    return verdict;
  }

  private estimateCostUsd(usage: Anthropic.Usage): number {
    // Haiku 4.5 pricing — verify before relying
    const INPUT_PER_MTOK = 1;
    const OUTPUT_PER_MTOK = 5;
    const CACHE_READ_PER_MTOK = 0.1;
    const CACHE_WRITE_PER_MTOK = 1.25;

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
