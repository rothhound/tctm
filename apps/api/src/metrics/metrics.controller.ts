import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { signals, tasks, llmAuditLog } from '../db/schema';

@Controller('metrics')
export class MetricsController {
  constructor(@Inject(DB) private readonly db: DbType) {}

  @Get('daily')
  async daily(@Query('days') daysParam?: string) {
    const days = parseInt(daysParam ?? '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Signals per source per day
    const signalsBySource = await this.db
      .select({
        source: signals.source,
        count: count(),
      })
      .from(signals)
      .where(gte(signals.createdAt, since))
      .groupBy(signals.source);

    // Tasks by status
    const tasksByStatus = await this.db
      .select({
        status: tasks.status,
        count: count(),
      })
      .from(tasks)
      .where(gte(tasks.createdAt, since))
      .groupBy(tasks.status);

    // Auto-create vs review ratio
    const autoCreated = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(and(gte(tasks.createdAt, since), eq(tasks.autoCreated, true)));

    const total = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(gte(tasks.createdAt, since));

    // LLM cost
    const costResult = await this.db
      .select({ total: sum(llmAuditLog.costUsd) })
      .from(llmAuditLog)
      .where(gte(llmAuditLog.createdAt, since));

    return {
      period: { days, since: since.toISOString() },
      signalsBySource: signalsBySource.reduce(
        (acc, r) => ({ ...acc, [r.source]: Number(r.count) }),
        {} as Record<string, number>,
      ),
      tasksByStatus: tasksByStatus.reduce(
        (acc, r) => ({ ...acc, [r.status]: Number(r.count) }),
        {} as Record<string, number>,
      ),
      autoCreateRatio: total[0]?.count
        ? Number(autoCreated[0]?.count ?? 0) / Number(total[0].count)
        : 0,
      totalLlmCostUsd: Number(costResult[0]?.total ?? 0),
    };
  }
}
