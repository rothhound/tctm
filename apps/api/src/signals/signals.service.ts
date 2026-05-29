import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { signals } from '../db/schema';

type SignalInsert = typeof signals.$inferInsert;

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(@Inject(DB) private readonly db: DbType) {}

  /**
   * Insert a signal with dedup. Returns the signal ID if inserted, null if duplicate.
   */
  async insertWithDedup(signal: SignalInsert): Promise<string | null> {
    const inserted = await this.db
      .insert(signals)
      .values(signal)
      .onConflictDoNothing({ target: signals.dedupKey })
      .returning({ id: signals.id });

    if (inserted.length === 0) {
      this.logger.log(`Signal ${signal.dedupKey} already exists, skipping`);
      return null;
    }

    return inserted[0].id;
  }

  async findById(id: string) {
    const [signal] = await this.db.select().from(signals).where(eq(signals.id, id));
    return signal ?? null;
  }

  async updateStatus(id: string, status: typeof signals.$inferSelect.status, extra?: Partial<typeof signals.$inferInsert>) {
    await this.db
      .update(signals)
      .set({ status, ...extra })
      .where(eq(signals.id, id));
  }
}
