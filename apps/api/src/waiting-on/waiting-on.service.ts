import { Inject, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, sql } from 'drizzle-orm';
import { ANTHROPIC, MODELS } from '../shared/anthropic.module';
import { DB, DbType } from '../db/db.module';
import { tasks, signals, entities, extractionFeedback } from '../db/schema';
import { EntitiesService } from '../entities/entities.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WaitingOnService {
  private readonly logger = new Logger(WaitingOnService.name);

  constructor(
    @Inject(ANTHROPIC) private readonly anthropic: Anthropic,
    @Inject(DB) private readonly db: DbType,
    private readonly entities: EntitiesService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Check if a new signal resolves any open waiting_on tasks.
   * Called after every signal ingestion.
   */
  async checkResolution(signalId: string): Promise<void> {
    // Load the signal
    const [signal] = await this.db.select().from(signals).where(eq(signals.id, signalId));
    if (!signal) return;

    // Resolve signal author to an entity
    const authorEmail = signal.payload.author?.email;
    const authorExternalId = signal.payload.author?.externalId;
    if (!authorEmail && !authorExternalId) return;

    let authorEntity;
    if (authorEmail) {
      authorEntity = await this.entities.resolveByEmail(authorEmail);
    }
    if (!authorEntity) return;

    // Find open tasks where this entity is in waitingOnEntityIds (only waiting-on
    // tasks ever populate that array, so it is the authoritative selector).
    const waitingTasks = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'pending'),
          sql`${tasks.waitingOnEntityIds}::jsonb @> ${JSON.stringify([authorEntity.id])}::jsonb`,
        ),
      );

    if (waitingTasks.length === 0) return;

    for (const task of waitingTasks) {
      const resolves = await this.checkIfResolves(task, signal);
      if (resolves) {
        await this.autoResolve(task.id, signalId);
      }
    }
  }

  private async checkIfResolves(
    task: typeof tasks.$inferSelect,
    signal: typeof signals.$inferSelect,
  ): Promise<boolean> {
    try {
      const response = await this.anthropic.messages.create({
        model: MODELS.CLASSIFIER,
        max_tokens: 100,
        system: [
          {
            type: 'text',
            text: 'You determine if a new message resolves a waiting-on task. Respond with ONLY valid JSON: {"resolves": true/false, "reason": "short explanation"}',
          },
        ],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              waitingOnTask: { title: task.title, description: task.description },
              newMessage: { body: signal.payload.body, author: signal.payload.author?.name },
            }),
          },
        ],
      });

      const text = response.content.find((b) => b.type === 'text')?.type === 'text'
        ? (response.content.find((b) => b.type === 'text') as Anthropic.TextBlock).text
        : '';
      const cleaned = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleaned);
      return result.resolves === true;
    } catch (err: any) {
      this.logger.error(`Resolution check failed: ${err.message}`);
      return false; // Fail-safe: don't auto-resolve on error
    }
  }

  private async autoResolve(taskId: string, signalId: string): Promise<void> {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) return;

    await this.db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    await this.db.insert(extractionFeedback).values({
      taskId,
      signalId,
      action: 'auto_resolved',
      reason: 'Waiting-on entity responded — auto-resolved by system',
      extractionSnapshot: task.extraction ?? {},
      wasAutoCreated: task.autoCreated,
    });

    this.notifications.sendPush({
      title: 'Task resolved',
      body: task.title,
      url: `/tasks/${taskId}`,
    }).catch((err) => this.logger.error(`Push failed: ${err.message}`));

    this.logger.log(`Auto-resolved waiting_on task "${task.title}" (${taskId})`);
  }
}
