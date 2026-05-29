import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { llmAuditLog } from '../db/schema';

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: DbType) {}

  async findBySignalId(signalId: string) {
    return this.db
      .select()
      .from(llmAuditLog)
      .where(eq(llmAuditLog.signalId, signalId))
      .orderBy(desc(llmAuditLog.createdAt));
  }

  async findByPurpose(purpose: string, since?: Date, until?: Date) {
    const conditions = [eq(llmAuditLog.purpose, purpose)];
    if (since) conditions.push(gte(llmAuditLog.createdAt, since));
    if (until) conditions.push(lte(llmAuditLog.createdAt, until));

    return this.db
      .select()
      .from(llmAuditLog)
      .where(and(...conditions))
      .orderBy(desc(llmAuditLog.createdAt))
      .limit(100);
  }

  async findRecent(limit = 50) {
    return this.db
      .select()
      .from(llmAuditLog)
      .orderBy(desc(llmAuditLog.createdAt))
      .limit(limit);
  }
}
