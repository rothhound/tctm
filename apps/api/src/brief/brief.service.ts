import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { tasks } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

export interface DailySummary {
  today: number;
  waitingOn: number;
  inbox: number;
  review: number;
  message: string;
}

@Injectable()
export class BriefService {
  private readonly logger = new Logger(BriefService.name);

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly notifications: NotificationsService,
  ) {}

  async composeSummary(): Promise<DailySummary> {
    const rows = await this.db
      .select({ bucket: tasks.bucket, count: count() })
      .from(tasks)
      .where(and(eq(tasks.status, 'pending'), eq(tasks.archived, false)))
      .groupBy(tasks.bucket);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.bucket] = Number(row.count);
    }

    const today = counts['today'] ?? 0;
    const waitingOn = counts['waiting_on'] ?? 0;
    const inbox = counts['inbox'] ?? 0;
    const review = counts['review'] ?? 0;

    const parts: string[] = [];
    if (today > 0) parts.push(`${today} must-do today`);
    if (waitingOn > 0) parts.push(`${waitingOn} waiting on responses`);
    if (inbox > 0) parts.push(`${inbox} new in inbox`);
    if (review > 0) parts.push(`${review} need review`);

    const message = parts.length > 0
      ? `Good morning. ${parts.join(', ')}.`
      : 'Good morning. All clear — nothing pending.';

    return { today, waitingOn, inbox, review, message };
  }

  async sendDailyBrief(): Promise<void> {
    const summary = await this.composeSummary();

    await this.notifications.sendPush({
      title: 'Daily Brief',
      body: summary.message,
      url: '/today',
    });

    this.logger.log(`Daily brief sent: ${summary.message}`);
  }
}
