import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { QUEUES } from '../shared/queues.module';
import { DB, DbType } from '../db/db.module';
import { signals, tasks, sourceConfig } from '../db/schema';
import { ExtractorService, ExtractInput } from './extractor.service';
import { JudgeService } from './judge.service';
import { ExtractedTask } from './types';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';

interface SourceThresholds {
  autoCreate: {
    explicitness: number;
    actionability: number;
    addressedToUser: number;
    overallConfidence: number;
  };
  skipBelow: {
    explicitness: number;
    actionability: number;
  };
}

const DEFAULT_THRESHOLDS: Record<string, SourceThresholds> = {
  // Granola action items are already pre-extracted — bias aggressive
  granola: {
    autoCreate: { explicitness: 0.6, actionability: 0.7, addressedToUser: 0.7, overallConfidence: 0.65 },
    skipBelow: { explicitness: 0.3, actionability: 0.4 },
  },
  // Slack DMs and @mentions in DMs are direct
  slack_dm: {
    autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
    skipBelow: { explicitness: 0.4, actionability: 0.4 },
  },
  // Slack channel mentions — high noise
  slack_channel: {
    autoCreate: { explicitness: 0.9, actionability: 0.85, addressedToUser: 0.9, overallConfidence: 0.85 },
    skipBelow: { explicitness: 0.5, actionability: 0.5 },
  },
  // Slack reaction trigger (🎯) — explicit user gesture, always auto
  slack_reaction: {
    autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
    skipBelow: { explicitness: 0, actionability: 0 },
  },
  // Gmail from known entities — moderate
  gmail_vip: {
    autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
    skipBelow: { explicitness: 0.4, actionability: 0.4 },
  },
  // Gmail cold inbound — conservative
  gmail_cold: {
    autoCreate: { explicitness: 0.9, actionability: 0.9, addressedToUser: 0.9, overallConfidence: 0.88 },
    skipBelow: { explicitness: 0.5, actionability: 0.5 },
  },
  // Notion @ mentions
  notion_mention: {
    autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
    skipBelow: { explicitness: 0.4, actionability: 0.4 },
  },
  // Notion DB row assigned to user — explicit
  notion_assigned: {
    autoCreate: { explicitness: 0.5, actionability: 0.6, addressedToUser: 0.9, overallConfidence: 0.6 },
    skipBelow: { explicitness: 0.3, actionability: 0.3 },
  },
};

@Processor(QUEUES.SIGNALS_EXTRACT, { concurrency: 3 })
export class SignalExtractProcessor extends WorkerHost {
  private readonly logger = new Logger(SignalExtractProcessor.name);

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly extractor: ExtractorService,
    private readonly judge: JudgeService,
    private readonly tasksService: TasksService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<{ signalId: string }>): Promise<void> {
    const { signalId } = job.data;

    const [signal] = await this.db.select().from(signals).where(eq(signals.id, signalId));
    if (!signal) {
      this.logger.warn(`Signal ${signalId} not found, skipping`);
      return;
    }
    if (signal.status !== 'pending') {
      this.logger.log(`Signal ${signalId} already processed (status=${signal.status}), skipping`);
      return;
    }

    await this.db
      .update(signals)
      .set({ extractionAttempts: signal.extractionAttempts + 1 })
      .where(eq(signals.id, signalId));

    // 1. Extract
    const input: ExtractInput = {
      signalId: signal.id,
      source: signal.source,
      subSource: signal.subSource ?? undefined,
      authorName: signal.payload.author?.name,
      authorEmail: signal.payload.author?.email,
      participants: signal.payload.participants,
      title: signal.payload.title,
      body: signal.payload.body,
      occurredAt: signal.payload.occurredAt,
    };

    let extraction;
    try {
      extraction = await this.extractor.extract(input);
    } catch (err) {
      await this.db
        .update(signals)
        .set({ status: 'failed', lastError: (err as Error).message })
        .where(eq(signals.id, signalId));
      throw err; // let BullMQ retry
    }

    if (extraction.noTask || extraction.tasks.length === 0) {
      await this.db
        .update(signals)
        .set({ status: 'no_task', processedAt: new Date() })
        .where(eq(signals.id, signalId));
      this.logger.log(`Signal ${signalId}: no task (${extraction.noTaskReason ?? 'unspecified'})`);
      return;
    }

    // 2. Resolve thresholds for this sub-source
    const subSourceKey = signal.subSource ?? signal.source;
    const thresholds = await this.loadThresholds(subSourceKey);

    // 3. For each extracted task: judge → route → persist
    for (const task of extraction.tasks) {
      await this.handleExtractedTask(signal.id, subSourceKey, task, thresholds);
    }

    await this.db
      .update(signals)
      .set({ status: 'extracted', processedAt: new Date() })
      .where(eq(signals.id, signalId));
  }

  private async handleExtractedTask(
    signalId: string,
    subSourceKey: string,
    task: ExtractedTask,
    thresholds: SourceThresholds,
  ): Promise<void> {
    // Skip-below check: signals too low to even bother judging
    if (
      task.signals.explicitness < thresholds.skipBelow.explicitness ||
      task.signals.actionability < thresholds.skipBelow.actionability
    ) {
      this.logger.log(`Signal ${signalId}: task "${task.title}" below skip threshold, dropping`);
      return;
    }

    // Multi-axis auto-create check
    const meetsAutoCreate =
      task.signals.explicitness >= thresholds.autoCreate.explicitness &&
      task.signals.actionability >= thresholds.autoCreate.actionability &&
      task.signals.addressedToUser >= thresholds.autoCreate.addressedToUser &&
      task.overallConfidence >= thresholds.autoCreate.overallConfidence &&
      task.ambiguityFlags.length === 0;

    // Judge pass — adversarial QC
    const judgeVerdict = await this.judge.judge(task, signalId);

    // Final routing decision
    let finalBucket: 'inbox' | 'review' = 'inbox';
    let dismissed = false;
    let reviewRequired = false;
    let autoCreated = false;

    if (judgeVerdict.verdict === 'DISMISS') {
      dismissed = true;
    } else if (judgeVerdict.verdict === 'REVIEW' || !meetsAutoCreate) {
      finalBucket = 'review';
      reviewRequired = true;
    } else {
      finalBucket = 'inbox';
      autoCreated = true;
    }

    // Compute dedup hash
    const dedupHash = createHash('sha256')
      .update(`${task.title.toLowerCase().trim()}|${task.type}|${task.entityRefs.map(e => e.entityId).filter(Boolean).sort().join(',')}`)
      .digest('hex')
      .slice(0, 16);

    const taskId = await this.tasksService.createFromExtraction({
      signalId,
      subSource: subSourceKey,
      task,
      judgeVerdict,
      finalBucket,
      dismissed,
      reviewRequired,
      autoCreated,
      dedupHash,
    });

    // Push notification for new tasks (not deduped, not dismissed)
    if (taskId && !dismissed && finalBucket === 'inbox') {
      this.notifications.sendPush({
        title: 'New task',
        body: task.title,
        url: `/tasks/${taskId}`,
      }).catch(err => this.logger.error(`Push failed: ${err.message}`));
    } else if (taskId && !dismissed && finalBucket === 'review') {
      this.notifications.sendPush({
        title: 'Review needed',
        body: task.title,
        url: `/review`,
      }).catch(err => this.logger.error(`Push failed: ${err.message}`));
    }
  }

  private async loadThresholds(subSourceKey: string): Promise<SourceThresholds> {
    const [row] = await this.db
      .select()
      .from(sourceConfig)
      .where(eq(sourceConfig.source, subSourceKey));

    if (row?.thresholds) return row.thresholds as SourceThresholds;
    return (
      DEFAULT_THRESHOLDS[subSourceKey] ??
      // Conservative fallback if we don't know the sub-source
      {
        autoCreate: { explicitness: 0.85, actionability: 0.85, addressedToUser: 0.85, overallConfidence: 0.8 },
        skipBelow: { explicitness: 0.4, actionability: 0.4 },
      }
    );
  }
}
