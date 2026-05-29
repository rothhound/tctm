import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { pushSubscriptions } from '../db/schema';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly vapidConfigured: boolean;

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT', 'mailto:admin@example.com');

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
      this.vapidConfigured = false;
    }
  }

  async subscribe(endpoint: string, keysP256dh: string, keysAuth: string): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({ endpoint, keysP256dh, keysAuth })
      .onConflictDoNothing({ target: pushSubscriptions.endpoint });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async sendPush(payload: PushPayload): Promise<void> {
    if (!this.vapidConfigured) return;

    const subs = await this.db.select().from(pushSubscriptions);
    const jsonPayload = JSON.stringify(payload);

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth },
          },
          jsonPayload,
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid — clean up
          await this.unsubscribe(sub.endpoint);
          this.logger.log(`Removed expired push subscription: ${sub.endpoint.slice(0, 50)}...`);
        } else {
          this.logger.error(`Push notification failed: ${err.message}`);
        }
      }
    }
  }
}
