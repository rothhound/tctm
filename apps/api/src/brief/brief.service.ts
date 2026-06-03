import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { tasks } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

export interface DailySummary {
  active: number;   // keep + review + manual (NULL) — the Active queue
  filtered: number; // agent-dismissed (noise)
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
      .select({ triage: tasks.triage, count: count() })
      .from(tasks)
      .where(and(eq(tasks.status, 'pending'), eq(tasks.archived, false), eq(tasks.reported, false)))
      .groupBy(tasks.triage);

    let active = 0;
    let filtered = 0;
    for (const row of rows) {
      const n = Number(row.count);
      if (row.triage === 'dismissed') filtered += n;
      else active += n; // keep, review, or NULL (manual) all surface in Active
    }

    const parts: string[] = [];
    if (active > 0) parts.push(`${active} task${active === 1 ? '' : 's'} in your queue`);
    if (filtered > 0) parts.push(`${filtered} filtered as noise`);

    const message = parts.length > 0
      ? `Good morning. ${parts.join(', ')}.`
      : 'Good morning. All clear — nothing pending.';

    return { active, filtered, message };
  }

  async sendDailyBrief(): Promise<void> {
    const summary = await this.composeSummary();

    await this.notifications.sendPush({
      title: 'Daily Brief',
      body: summary.message,
      url: '/active',
    });

    this.logger.log(`Daily brief sent: ${summary.message}`);
  }
}
