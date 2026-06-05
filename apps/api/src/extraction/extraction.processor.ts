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
  // Granola signals are dense AI meeting summaries (high signal quality) — bias aggressive
  granola: {
    autoCreate: { explicitness: 0.6, actionability: 0.7, addressedToUser: 0.7, overallConfidence: 0.65 },
    skipBelow: { explicitness: 0.3, actionability: 0.4 },
  },
  // Slack DMs and @mentions in DMs are direct
  slack_dm: {
    autoCreate: { explicitness: 0.75, actionability: 0.75, addressedToUser: 0.85, overallConfidence: 0.75 },
    skipBelow: { explicitness: 0.4, actionability: 0.4 },
  },
  // Slack message that directly @mentions or names the partner — a strong "this is for you" signal;
  // lenient but still judged so genuine asks reach Active while obvious non-tasks get filtered.
  slack_mention: {
    autoCreate: { explicitness: 0.7, actionability: 0.7, addressedToUser: 0.7, overallConfidence: 0.65 },
    skipBelow: { explicitness: 0.3, actionability: 0.3 },
  },
  // Slack channel message anchored only by the partner being in the thread (no tag/name) — weak
  // signal, high noise → conservative.
  slack_channel: {
    autoCreate: { explicitness: 0.9, actionability: 0.85, addressedToUser: 0.9, overallConfidence: 0.85 },
    skipBelow: { explicitness: 0.5, actionability: 0.5 },
  },
  // Slack @tctm capture — explicit partner gesture, always auto (judge bypassed in handleExtractedTask)
  slack_capture: {
    autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
    skipBelow: { explicitness: 0, actionability: 0 },
  },
  // Slack 🎯 reaction capture — explicit partner gesture, always auto (judge bypassed)
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
  // Gmail forward WITH a note — deliberate drop into the task inbox; lenient (judge still runs)
  gmail_forward: {
    autoCreate: { explicitness: 0.6, actionability: 0.65, addressedToUser: 0.6, overallConfidence: 0.6 },
    skipBelow: { explicitness: 0.2, actionability: 0.2 },
  },
  // Gmail from a priority sender (configured list + the firm's own domain) — aggressive capture,
  // always auto (judge bypassed); thresholds zero. Differentiates these from cold dropbox mail.
  gmail_priority: {
    autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
    skipBelow: { explicitness: 0, actionability: 0 },
  },
  // Gmail direct email to the tctm@ dropbox (not a forward) — a deliberate drop; lenient, judge runs
  // so genuine non-tasks / near-duplicates still get filtered.
  gmail_dropbox: {
    autoCreate: { explicitness: 0.6, actionability: 0.65, addressedToUser: 0.5, overallConfidence: 0.6 },
    skipBelow: { explicitness: 0.2, actionability: 0.2 },
  },
  // Gmail bare forward (no note) — explicit partner capture, always auto (judge bypassed)
  gmail_capture: {
    autoCreate: { explicitness: 0, actionability: 0, addressedToUser: 0, overallConfidence: 0 },
    skipBelow: { explicitness: 0, actionability: 0 },
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

/**
 * Sub-sources where the PARTNER explicitly asked for the capture: Slack @tctm / 🎯 reaction, and a
 * bare Gmail forward (an email dropped into the task inbox with no note). These bypass the skip-below
 * gate and the adversarial judge — the partner's intent is the QC. Passive `slack_channel` and noted
 * `gmail_forward` are NOT here; they run the normal pipeline.
 */
const EXPLICIT_CAPTURE_SUBSOURCES = new Set(['slack_capture', 'slack_reaction', 'gmail_capture', 'gmail_priority']);

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

    // Connector pause: if the source connector is disabled, don't extract (no tasks while paused).
    const [connectorCfg] = await this.db
      .select()
      .from(sourceConfig)
      .where(eq(sourceConfig.source, signal.source));
    if (connectorCfg?.enabled === false) {
      await this.db
        .update(signals)
        .set({ status: 'skipped', processedAt: new Date() })
        .where(eq(signals.id, signalId));
      this.logger.log(`Signal ${signalId}: connector "${signal.source}" is paused — skipped`);
      return;
    }

    await this.db
      .update(signals)
      .set({ extractionAttempts: signal.extractionAttempts + 1 })
      .where(eq(signals.id, signalId));

    // 1. Extract
    const subSourceKey = signal.subSource ?? signal.source;
    const isExplicit = EXPLICIT_CAPTURE_SUBSOURCES.has(subSourceKey);
    this.logger.log(`processing ${signal.id} (${signal.source}/${signal.subSource ?? '—'})${isExplicit ? ' [explicit capture]' : ''}`);

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
      explicitCapture: isExplicit,
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
      if (!isExplicit) {
        await this.db
          .update(signals)
          .set({ status: 'no_task', processedAt: new Date() })
          .where(eq(signals.id, signalId));
        this.logger.log(`Signal ${signalId}: no task (${extraction.noTaskReason ?? 'unspecified'})`);
        return;
      }
      // Explicit partner capture (@tctm / 🎯): the partner decided it IS a task, so never drop it.
      // The prompt override makes this rare; this is the last-resort safety net.
      this.logger.warn(
        `Signal ${signalId}: explicit capture returned noTask (${extraction.noTaskReason ?? 'unspecified'}) — synthesizing fallback task`,
      );
      extraction = { noTask: false, tasks: [this.fallbackTaskFromSignal(signal)] };
    }

    // 2. Resolve thresholds for this sub-source
    const thresholds = await this.loadThresholds(subSourceKey);

    // 3. For each extracted task: judge → route → persist
    const sourceMeta = { url: signal.payload.url, sentBy: signal.payload.author };
    for (const task of extraction.tasks) {
      await this.handleExtractedTask(signal.id, subSourceKey, task, thresholds, sourceMeta);
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
    sourceMeta: { url?: string; sentBy?: { name?: string; email?: string } },
  ): Promise<void> {
    const isExplicit = EXPLICIT_CAPTURE_SUBSOURCES.has(subSourceKey);

    let triage: 'keep' | 'review' | 'dismissed' = 'keep';
    let autoCreated = false;
    let judgeVerdict;

    if (isExplicit) {
      // The partner explicitly captured this (@tctm / 🎯). No skip-below gate, no judge —
      // their gesture is the QC. Keep it.
      judgeVerdict = { verdict: 'KEEP' as const, reason: 'Explicit partner capture (judge bypassed)' };
      triage = 'keep';
      autoCreated = true;
    } else {
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
      judgeVerdict = await this.judge.judge(task, signalId);

      // Final triage decision (agent dimension — independent of the user lifecycle)
      if (judgeVerdict.verdict === 'DISMISS') {
        triage = 'dismissed';
      } else if (judgeVerdict.verdict === 'REVIEW' || !meetsAutoCreate) {
        triage = 'review'; // lower-confidence; still shows in Active, user can Report non-tasks
      } else {
        triage = 'keep';
        autoCreated = true;
      }
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
      triage,
      autoCreated,
      dedupHash,
      sourceMeta,
    });

    // Always log the outcome — a successful capture is otherwise silent, which reads as "nothing happened".
    if (taskId) {
      this.logger.log(
        `Signal ${signalId}: task "${task.title}" → ${triage}${autoCreated ? ' (auto)' : ''} [${taskId}]`,
      );
    }

    // Push for tasks that surface in Active (keep + review); dismissed (Filtered) stays silent.
    if (taskId && triage !== 'dismissed') {
      this.notifications.sendPush({
        title: 'New task',
        body: task.title,
        url: `/active/${taskId}`,
      }).catch(err => this.logger.error(`Push failed: ${err.message}`));
    }
  }

  /**
   * Minimal task synthesized when an EXPLICIT capture (@tctm / 🎯) extracts nothing — so the
   * partner's deliberate capture is never silently dropped. The partner can refine it in the UI.
   */
  private fallbackTaskFromSignal(signal: typeof signals.$inferSelect): ExtractedTask {
    const body = signal.payload.body ?? '';
    return {
      title: (signal.payload.title || 'Captured from Slack').slice(0, 180),
      description: body.slice(0, 500),
      type: 'do',
      entityRefs: [],
      sourceQuote: (body || signal.payload.title || 'explicit capture').slice(0, 1000),
      signals: { explicitness: 1, actionability: 1, addressedToUser: 1, entityMatchConfidence: 0, temporalClarity: 0 },
      overallConfidence: 1,
      ambiguityFlags: [],
    };
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
