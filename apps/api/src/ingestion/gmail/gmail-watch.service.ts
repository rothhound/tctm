import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { gmailWatchState } from '../../db/schema';
import { resolveGmailClient } from './gmail-auth';
import { GmailService } from './gmail.service';

/**
 * Manages the Gmail push "watch".
 *
 * Connection cycle: `users.watch` registers a 7-day watch on the INBOX and returns a `historyId`
 * checkpoint. While active, Gmail publishes a Pub/Sub message on EVERY mailbox change — in real
 * time, 24/7, not only at renewal. The push handler then `history.list`s the delta since our stored
 * checkpoint and advances it. This service:
 *   - registers the watch ON BOOT, so ingestion is live immediately (no wait for the 3 AM cron), and
 *   - renews daily so the 7-day watch never lapses.
 * On renewal/boot it PRESERVES the stored checkpoint (never jumps it forward) and catches up from
 * it — so anything that arrived while we were down is recovered instead of skipped.
 */
@Injectable()
export class GmailWatchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GmailWatchService.name);

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
    private readonly gmailService: GmailService,
  ) {}

  onApplicationBootstrap(): void {
    // Fire-and-forget so a missing/slow Gmail setup never blocks app startup. renewWatch() guards
    // against missing topic/auth and swallows its own errors.
    void this.renewWatch();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async renewWatch(): Promise<void> {
    const topic = this.config.get<string>('GMAIL_PUBSUB_TOPIC');
    if (!topic) {
      this.logger.warn('GMAIL_PUBSUB_TOPIC not set — skipping watch renewal');
      return;
    }

    let resolved;
    try {
      resolved = resolveGmailClient(this.config);
    } catch (err: any) {
      this.logger.error(`Gmail auth misconfigured — skipping watch renewal: ${err.message}`);
      return;
    }
    if (!resolved) {
      this.logger.warn('Gmail auth not configured (delegation or refresh token) — skipping watch renewal');
      return;
    }

    try {
      const response = await resolved.client.users.watch({
        userId: 'me',
        requestBody: { topicName: topic, labelIds: ['INBOX'] },
      });

      const newHistoryId = response.data.historyId;
      const expiration = response.data.expiration;
      if (!newHistoryId) {
        this.logger.warn('Gmail watch returned no historyId');
        return;
      }
      const watchExpiresAt = expiration
        ? new Date(parseInt(expiration))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [existing] = await this.db.select().from(gmailWatchState).where(eq(gmailWatchState.id, 'singleton'));

      if (!existing?.historyId) {
        // First watch ever: establish the checkpoint. There's nothing prior to catch up on.
        await this.db
          .insert(gmailWatchState)
          .values({ id: 'singleton', historyId: newHistoryId, watchExpiresAt, lastSyncedAt: new Date() })
          .onConflictDoUpdate({
            target: gmailWatchState.id,
            set: { historyId: newHistoryId, watchExpiresAt, lastSyncedAt: new Date() },
          });
        this.logger.log(`Gmail watch established. historyId=${newHistoryId}, expires=${expiration}`);
        return;
      }

      // Renewal/boot: refresh the expiry but KEEP the stored checkpoint — overwriting it would skip
      // every message that arrived since it was set (e.g. during downtime between pushes).
      await this.db
        .update(gmailWatchState)
        .set({ watchExpiresAt, lastSyncedAt: new Date() })
        .where(eq(gmailWatchState.id, 'singleton'));
      this.logger.log(`Gmail watch renewed (checkpoint kept at ${existing.historyId}). expires=${expiration}`);

      // Catch up from the preserved checkpoint up to now. processHistoryNotification reads the stored
      // checkpoint as startHistoryId, processes the delta, advances it, and falls back to a 24h sync
      // if the checkpoint is older than Gmail's history retention.
      await this.gmailService.processHistoryNotification(newHistoryId);
    } catch (err: any) {
      this.logger.error(`Gmail watch renewal failed: ${err.message}`);
    }
  }
}
