import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { tasks, extractionFeedback, taskNotes } from '../db/schema';
import { ExtractedTask, JudgeVerdict } from '../extraction/types';
import { LlmService } from '../shared/llm/llm.service';

interface CreateFromExtractionInput {
  signalId: string;
  subSource: string;
  task: ExtractedTask;
  judgeVerdict: JudgeVerdict;
  triage: 'keep' | 'review' | 'dismissed';
  autoCreated: boolean;
  dedupHash: string;
  sourceMeta?: { url?: string; sentBy?: { name?: string; email?: string } };
}

// Active shows keep + review + manual (NULL); only judge-dismissed is hidden (→ Filtered view).
const notDismissed = or(isNull(tasks.triage), ne(tasks.triage, 'dismissed'));

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly llm: LlmService,
  ) {}

  async createFromExtraction(input: CreateFromExtractionInput): Promise<string | null> {
    const dedupSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existing = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.dedupHash, input.dedupHash), gte(tasks.createdAt, dedupSince)))
      .limit(1);

    if (existing.length > 0) {
      const dup = existing[0];
      const newSources = Array.from(new Set([...dup.sourceSignalIds, input.signalId]));
      await this.db
        .update(tasks)
        .set({ sourceSignalIds: newSources, updatedAt: new Date() })
        .where(eq(tasks.id, dup.id));
      this.logger.log(`Task "${input.task.title}" deduped to existing ${dup.id}`);
      return dup.id;
    }

    // Derive parent source from subSource (e.g., 'slack_dm' → 'slack')
    const parentSource = input.subSource.split('_')[0];

    const [row] = await this.db
      .insert(tasks)
      .values({
        title: input.task.title,
        description: input.task.description,
        source: parentSource,
        status: 'pending',
        priority: 'mid',
        sourceMeta: input.sourceMeta,
        entityIds: input.task.entityRefs.map(r => r.entityId).filter(Boolean) as string[],
        waitingOnEntityIds: (input.task.waitingOnEntityRefs ?? []).map(r => r.entityId).filter(Boolean) as string[],
        sourceSignalIds: [input.signalId],
        dueAt: input.task.dueAtIso ? new Date(input.task.dueAtIso) : null,
        dedupHash: input.dedupHash,
        autoCreated: input.autoCreated,
        triage: input.triage,
        extraction: this.buildExtractionMetadata(input.task, input.judgeVerdict),
      })
      .returning({ id: tasks.id });

    if (input.triage === 'dismissed') {
      this.logger.log(`Task "${input.task.title}" filtered (dismissed) by judge: ${input.judgeVerdict.reason}`);
    }

    return row.id;
  }

  private buildExtractionMetadata(task: ExtractedTask, verdict: JudgeVerdict) {
    return {
      sourceQuote: task.sourceQuote,
      confidence: task.overallConfidence,
      signals: task.signals,
      ambiguityFlags: task.ambiguityFlags,
      judge: verdict,
      extractorModel: this.llm.modelFor('extract'),
      judgeModel: this.llm.modelFor('judge'),
      extractedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Read API — the Active queue (pending, not archived/reported/snoozed, not agent-dismissed)
  // ============================================================================

  async listActive(page = 1, limit = 25) {
    const now = new Date();
    const conditions = and(
      eq(tasks.archived, false),
      eq(tasks.reported, false),
      isNull(tasks.parentTaskId),
      or(isNull(tasks.reminderAt), lte(tasks.reminderAt, now)),
      notDismissed,
    );

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(conditions);

    const total = Number(totalRow?.count ?? 0);
    const offset = (page - 1) * limit;

    const data = await this.db
      .select()
      .from(tasks)
      .where(conditions)
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, hasMore: offset + data.length < total };
  }

  async listArchived() {
    // User-archived only now — the judge no longer sets `archived` (it sets triage='dismissed').
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.archived, true), eq(tasks.reported, false)))
      .orderBy(desc(tasks.archivedAt));
  }

  async listFiltered() {
    // Agent-dismissed tasks — what the judge hid from Active. User actions still win.
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.triage, 'dismissed'), eq(tasks.archived, false), eq(tasks.reported, false)))
      .orderBy(desc(tasks.createdAt));
  }

  async listDone() {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'done'),
          eq(tasks.archived, false),
          eq(tasks.reported, false),
          isNull(tasks.parentTaskId),
          notDismissed,
        ),
      )
      .orderBy(desc(tasks.completedAt));
  }

  async listSnoozed() {
    const now = new Date();
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.archived, false),
          eq(tasks.reported, false),
          isNull(tasks.parentTaskId),
          gte(tasks.reminderAt, now),
          notDismissed,
        ),
      )
      .orderBy(tasks.reminderAt);
  }

  async listReported() {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.reported, true))
      .orderBy(desc(tasks.reportedAt));
  }

  async report(taskId: string, reason?: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');

    await this.db
      .update(tasks)
      .set({ reported: true, reportedAt: new Date(), reportReason: reason ?? null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    await this.db.insert(extractionFeedback).values({
      taskId,
      signalId: task.sourceSignalIds[0] ?? null,
      action: 'dismissed',
      reason: reason ?? 'Reported as bad extraction',
      extractionSnapshot: task.extraction ?? {},
      wasAutoCreated: task.autoCreated,
    });
  }

  async unreport(taskId: string) {
    await this.db
      .update(tasks)
      .set({ reported: false, reportedAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  async findOne(id: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async getSubtasks(parentId: string) {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, parentId))
      .orderBy(tasks.createdAt);
  }

  async setReminder(taskId: string, reminderAt: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');

    await this.db
      .update(tasks)
      .set({ reminderAt: new Date(reminderAt), updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  async clearReminder(taskId: string) {
    await this.db
      .update(tasks)
      .set({ reminderAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  async getCounts() {
    const now = new Date();

    // Pending count (what shows in Active → Pending section)
    const [pendingRow] = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'pending'),
          eq(tasks.archived, false),
          eq(tasks.reported, false),
          isNull(tasks.parentTaskId),
          or(isNull(tasks.reminderAt), lte(tasks.reminderAt, now)),
          notDismissed,
        ),
      );

    // Filtered count (agent-dismissed, not user-archived/reported)
    const [filteredRow] = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(and(eq(tasks.triage, 'dismissed'), eq(tasks.archived, false), eq(tasks.reported, false)));

    // Done count (what shows in Active → Done section)
    const [doneRow] = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'done'),
          eq(tasks.archived, false),
          eq(tasks.reported, false),
          isNull(tasks.parentTaskId),
          or(isNull(tasks.reminderAt), lte(tasks.reminderAt, now)),
        ),
      );

    // Total active = pending + done (non-archived, non-reported)
    const pending = Number(pendingRow?.count ?? 0);
    const done = Number(doneRow?.count ?? 0);
    const filtered = Number(filteredRow?.count ?? 0);

    return { pending, done, total: pending + done, filtered };
  }

  /**
   * Per-bucket "new since you last looked" counts for the nav badges. For each bucket the client
   * passes the timestamp it last acknowledged; we count items in that bucket created after it.
   * A missing timestamp yields 0 (bucket not yet baselined → nothing to flag).
   */
  async getNewCounts(since: { active?: string; snoozed?: string; filtered?: string }) {
    const now = new Date();
    const out = { active: 0, snoozed: 0, filtered: 0 };

    // The client watermark is a task's createdAt serialized to millisecond precision, but Postgres
    // stores defaultNow() at microsecond precision — so a plain `createdAt > watermark` always counts
    // the boundary task (…123456 > …123000). Truncate to ms so the comparison matches the client.
    const newerThan = (iso: string) => sql`date_trunc('milliseconds', ${tasks.createdAt}) > ${new Date(iso)}`;

    if (since.active) {
      const [r] = await this.db.select({ count: count() }).from(tasks).where(and(
        eq(tasks.status, 'pending'),
        eq(tasks.archived, false),
        eq(tasks.reported, false),
        isNull(tasks.parentTaskId),
        or(isNull(tasks.reminderAt), lte(tasks.reminderAt, now)),
        notDismissed,
        newerThan(since.active),
      ));
      out.active = Number(r?.count ?? 0);
    }

    if (since.snoozed) {
      const [r] = await this.db.select({ count: count() }).from(tasks).where(and(
        eq(tasks.archived, false),
        eq(tasks.reported, false),
        isNull(tasks.parentTaskId),
        gte(tasks.reminderAt, now),
        notDismissed,
        newerThan(since.snoozed),
      ));
      out.snoozed = Number(r?.count ?? 0);
    }

    if (since.filtered) {
      const [r] = await this.db.select({ count: count() }).from(tasks).where(and(
        eq(tasks.triage, 'dismissed'),
        eq(tasks.archived, false),
        eq(tasks.reported, false),
        newerThan(since.filtered),
      ));
      out.filtered = Number(r?.count ?? 0);
    }

    return out;
  }

  // ============================================================================
  // User actions
  // ============================================================================

  async edit(taskId: string, updates: Record<string, any>, reason?: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');

    // Convert date strings to Date objects for timestamp columns
    const cleaned: Record<string, any> = { ...updates, updatedAt: new Date() };
    for (const key of ['dueAt', 'reminderAt'] as const) {
      if (key in cleaned) {
        cleaned[key] = cleaned[key] ? new Date(cleaned[key]) : null;
      }
    }

    await this.db
      .update(tasks)
      .set(cleaned)
      .where(eq(tasks.id, taskId));

    await this.db.insert(extractionFeedback).values({
      taskId,
      signalId: task.sourceSignalIds[0] ?? null,
      action: 'edited',
      reason,
      extractionSnapshot: { before: task, updates },
      wasAutoCreated: task.autoCreated,
    });
  }

  async complete(taskId: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');

    await this.db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // If this is a subtask, check if all siblings are done → auto-complete parent
    if (task.parentTaskId) {
      await this.checkParentCompletion(task.parentTaskId);
    }

    // If recurring, clone for next occurrence
    if (task.recurrence) {
      await this.createNextRecurrence(task);
    }
  }

  async uncomplete(taskId: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');

    await this.db
      .update(tasks)
      .set({ status: 'pending', completedAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  async archive(taskId: string) {
    await this.db
      .update(tasks)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  async unarchive(taskId: string) {
    await this.db
      .update(tasks)
      .set({ archived: false, archivedAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  /** Restore an agent-dismissed (Filtered) task into Active by promoting its verdict to keep. */
  async restore(taskId: string) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');

    await this.db
      .update(tasks)
      .set({ triage: 'keep', updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // The agent filtered a real task — record the correction as training feedback.
    await this.db.insert(extractionFeedback).values({
      taskId,
      signalId: task.sourceSignalIds[0] ?? null,
      action: 'accepted',
      reason: 'Restored from Filtered (agent false-negative)',
      extractionSnapshot: task.extraction ?? {},
      wasAutoCreated: task.autoCreated,
    });
  }

  // ============================================================================
  // Subtasks
  // ============================================================================

  async createSubtask(parentId: string, data: { title: string; description?: string; priority?: 'high' | 'mid' | 'low'; dueAt?: string }) {
    const parent = await this.findOne(parentId);

    const [row] = await this.db
      .insert(tasks)
      .values({
        title: data.title,
        description: data.description,
        status: 'pending',
        // Manually-created subtask → no agent verdict (triage NULL); nested, so never listed directly.
        priority: data.priority ?? 'mid',
        parentTaskId: parentId,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        entityIds: parent.entityIds,
        sourceSignalIds: [],
        waitingOnEntityIds: [],
      })
      .returning({ id: tasks.id });

    return row.id;
  }

  private async checkParentCompletion(parentId: string) {
    const siblings = await this.db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.parentTaskId, parentId));

    const allDone = siblings.length > 0 && siblings.every(s => s.status === 'done');
    if (allDone) {
      await this.db
        .update(tasks)
        .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(tasks.id, parentId));
      this.logger.log(`Parent task ${parentId} auto-completed — all subtasks done`);
    }
  }

  // ============================================================================
  // Notes
  // ============================================================================

  async getTaskNotes(taskId: string) {
    return this.db
      .select()
      .from(taskNotes)
      .where(eq(taskNotes.taskId, taskId))
      .orderBy(desc(taskNotes.createdAt));
  }

  async createTaskNote(taskId: string, content: string) {
    await this.findOne(taskId);

    const [row] = await this.db
      .insert(taskNotes)
      .values({ taskId, content })
      .returning();

    await this.db
      .update(tasks)
      .set({ updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    return row;
  }

  async deleteTaskNote(noteId: string) {
    const [note] = await this.db
      .select()
      .from(taskNotes)
      .where(eq(taskNotes.id, noteId));

    if (!note) throw new NotFoundException('Note not found');

    await this.db
      .delete(taskNotes)
      .where(eq(taskNotes.id, noteId));
  }

  // ============================================================================
  // Recurrence
  // ============================================================================

  private async createNextRecurrence(task: typeof tasks.$inferSelect) {
    if (!task.recurrence || !task.dueAt) return;

    const nextDueAt = this.computeNextDueDate(task.dueAt, task.recurrence);
    if (!nextDueAt) return;

    const [newTask] = await this.db
      .insert(tasks)
      .values({
        title: task.title,
        description: task.description,
        status: 'pending',
        priority: task.priority,
        dueAt: nextDueAt,
        recurrence: { ...task.recurrence, nextDueAt: nextDueAt.toISOString() },
        entityIds: task.entityIds,
        sourceSignalIds: task.sourceSignalIds,
        waitingOnEntityIds: task.waitingOnEntityIds,
        extraction: task.extraction,
        autoCreated: task.autoCreated,
        triage: task.triage, // recurrence clone keeps the agent verdict
        sourceMeta: task.sourceMeta,
      })
      .returning({ id: tasks.id });

    // Clone subtasks (reset to pending)
    const subtasks = await this.getSubtasks(task.id);
    for (const sub of subtasks) {
      await this.db.insert(tasks).values({
        title: sub.title,
        description: sub.description,
        status: 'pending',
        priority: sub.priority,
        parentTaskId: newTask.id,
      });
    }

    this.logger.log(`Created next recurrence of "${task.title}" due ${nextDueAt.toISOString()}`);
  }

  private computeNextDueDate(
    currentDue: Date,
    recurrence: NonNullable<typeof tasks.$inferSelect.recurrence>,
  ): Date | null {
    const interval = recurrence.interval ?? 1;
    const next = new Date(currentDue);

    switch (recurrence.pattern) {
      case 'daily':
        next.setDate(next.getDate() + interval);
        return next;
      case 'weekly':
        next.setDate(next.getDate() + 7 * interval);
        return next;
      case 'monthly':
        next.setMonth(next.getMonth() + interval);
        return next;
      case 'custom':
        // For custom with daysOfWeek, find next matching day
        if (recurrence.daysOfWeek?.length) {
          const sorted = [...recurrence.daysOfWeek].sort();
          const currentDay = next.getDay();
          const nextDay = sorted.find(d => d > currentDay) ?? sorted[0];
          const daysAhead = nextDay > currentDay
            ? nextDay - currentDay
            : 7 - currentDay + nextDay;
          next.setDate(next.getDate() + daysAhead);
          return next;
        }
        return null;
      default:
        return null;
    }
  }
}
