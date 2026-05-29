import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { google } from 'googleapis';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { gmailWatchState } from '../../db/schema';

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
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const topic = this.config.get<string>('GMAIL_PUBSUB_TOPIC');

    if (!clientId || !clientSecret || !topic) {
      this.logger.warn('Gmail not configured — skipping watch renewal');
      return;
    }

    try {
      const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
      // TODO: Load refresh token from oauthTokens table
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });

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
