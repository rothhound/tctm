import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { gmailWatchState } from '../../db/schema';
import { resolveGmailClient } from './gmail-auth';

/**
 * Renews the Gmail push notification watch daily.
 * Gmail watches expire after 7 days, so renewing daily provides margin.
 */
@Injectable()
export class GmailWatchService {
  private readonly logger = new Logger(GmailWatchService.name);

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
  ) {}

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
      const gmail = resolved.client;

      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: topic,
          labelIds: ['INBOX'],
        },
      });

      const historyId = response.data.historyId;
      const expiration = response.data.expiration;

      if (historyId) {
        // Upsert watch state
        await this.db
          .insert(gmailWatchState)
          .values({
            id: 'singleton',
            historyId,
            watchExpiresAt: expiration ? new Date(parseInt(expiration)) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: gmailWatchState.id,
            set: {
              historyId,
              watchExpiresAt: expiration ? new Date(parseInt(expiration)) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              lastSyncedAt: new Date(),
            },
          });

        this.logger.log(`Gmail watch renewed. historyId=${historyId}, expires=${expiration}`);
      }
    } catch (err: any) {
      this.logger.error(`Gmail watch renewal failed: ${err.message}`);
    }
  }
}
