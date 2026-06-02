import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../shared/llm/llm.service';
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
    private readonly llm: LlmService,
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

    const completion = await this.llm.complete({
      purpose: 'judge',
      system: promptVersion.content,
      user: userContent,
      maxTokens: 300,
      cacheSystem: true,
    });

    const latencyMs = Date.now() - startedAt;
    const text = completion.text;

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
      model: completion.model,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      cacheReadTokens: completion.usage.cacheReadTokens,
      cacheCreationTokens: completion.usage.cacheCreationTokens,
      inputSnapshot: { user: userContent.slice(0, 3000) },
      outputSnapshot: verdict,
      latencyMs,
      costUsd: completion.costUsd,
    });

    return verdict;
  }
}
