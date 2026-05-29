import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { google, gmail_v1 } from 'googleapis';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { gmailWatchState, signals } from '../../db/schema';
import { QUEUES } from '../../shared/queues.module';
import { isAutoSender } from './auto-senders';
import { EntitiesService } from '../../entities/entities.service';

type SignalInsert = typeof signals.$inferInsert;

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private gmail: gmail_v1.Gmail | null = null;
  private readonly userEmail: string;

  constructor(
    @Inject(DB) private readonly db: DbType,
    @InjectQueue(QUEUES.SIGNALS_EXTRACT) private readonly extractQueue: Queue,
    private readonly config: ConfigService,
    private readonly entities: EntitiesService,
  ) {
    this.userEmail = config.get<string>('GMAIL_USER_EMAIL', '');
  }

  /**
   * Process a Pub/Sub push notification — fetch history since last known historyId.
   */
  async processHistoryNotification(historyId: string): Promise<void> {
    const gmail = await this.getGmailClient();
    if (!gmail) return;

    const [state] = await this.db.select().from(gmailWatchState).where(eq(gmailWatchState.id, 'singleton'));
    const startHistoryId = state?.historyId;

    if (!startHistoryId) {
      this.logger.warn('No stored historyId — run initial sync first');
      return;
    }

    try {
      const history = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
      });

      const messageIds = new Set<string>();
      for (const record of history.data.history ?? []) {
        for (const msg of record.messagesAdded ?? []) {
          if (msg.message?.id) messageIds.add(msg.message.id);
        }
      }

      for (const msgId of messageIds) {
        await this.processMessage(gmail, msgId);
      }

      // Update stored historyId
      await this.db
        .update(gmailWatchState)
        .set({ historyId, lastSyncedAt: new Date() })
        .where(eq(gmailWatchState.id, 'singleton'));
    } catch (err: any) {
      if (err.code === 404) {
        this.logger.warn('historyId expired — falling back to 24h full sync');
        await this.fullSync24h(gmail);
      } else {
        throw err;
      }
    }
  }

  private async processMessage(gmail: gmail_v1.Gmail, messageId: string): Promise<void> {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = msg.data.payload?.headers ?? [];
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? '';
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '';
    const labelIds = msg.data.labelIds ?? [];

    // Skip drafts, sent, trash
    if (labelIds.includes('DRAFT') || labelIds.includes('SENT') || labelIds.includes('TRASH')) return;

    // Extract email from "Name <email>" format
    const emailMatch = from.match(/<([^>]+)>/);
    const authorEmail = emailMatch ? emailMatch[1] : from.trim();
    const authorName = emailMatch ? from.replace(/<[^>]+>/, '').trim() : '';

    // Skip auto-senders
    if (isAutoSender(authorEmail)) return;

    const body = this.extractBody(msg.data.payload);
    if (!body.trim()) return;

    // Classify sub-source
    const entity = await this.entities.resolveByEmail(authorEmail);
    const subSource = entity ? 'gmail_vip' : 'gmail_cold';

    const signal: SignalInsert = {
      source: 'gmail',
      subSource,
      externalId: messageId,
      dedupKey: `gmail:${messageId}`,
      status: 'pending',
      payload: {
        title: subject || 'No subject',
        body: this.cleanBody(body),
        author: { name: authorName, email: authorEmail },
        url: `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
        threadId: msg.data.threadId ?? undefined,
        occurredAt: new Date(parseInt(msg.data.internalDate ?? '0')).toISOString(),
        raw: { labelIds, snippet: msg.data.snippet },
      },
    };

    const inserted = await this.db
      .insert(signals)
      .values(signal)
      .onConflictDoNothing({ target: signals.dedupKey })
      .returning({ id: signals.id });

    if (inserted.length > 0) {
      await this.extractQueue.add('extract', { signalId: inserted[0].id });
    }
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';

    // Plain text part
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Multipart — recurse
    if (payload.parts) {
      // Prefer text/plain
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
      }
      // Fall back to text/html stripped
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          return this.stripHtml(html);
        }
      }
      // Recurse deeper
      for (const part of payload.parts) {
        const result = this.extractBody(part);
        if (result) return result;
      }
    }

    return '';
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  cleanBody(body: string): string {
    // Remove quoted replies (lines starting with >)
    const lines = body.split('\n');
    const cleaned: string[] = [];
    for (const line of lines) {
      if (line.startsWith('>')) continue;
      // Stop at common signature markers
      if (/^--\s*$/.test(line)) break;
      if (/^_{5,}$/.test(line)) break;
      if (/^Sent from my (iPhone|iPad|Android)/i.test(line)) break;
      cleaned.push(line);
    }
    return cleaned.join('\n').trim().slice(0, 4000);
  }

  private async fullSync24h(gmail: gmail_v1.Gmail): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const query = `after:${Math.floor(since.getTime() / 1000)}`;

    const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100 });
    for (const msg of list.data.messages ?? []) {
      if (msg.id) await this.processMessage(gmail, msg.id);
    }

    // Get latest historyId from profile
    const profile = await gmail.users.getProfile({ userId: 'me' });
    if (profile.data.historyId) {
      await this.db
        .update(gmailWatchState)
        .set({ historyId: profile.data.historyId, lastSyncedAt: new Date() })
        .where(eq(gmailWatchState.id, 'singleton'));
    }
  }

  private async getGmailClient(): Promise<gmail_v1.Gmail | null> {
    if (this.gmail) return this.gmail;

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      this.logger.warn('Google OAuth not configured — Gmail ingestion disabled');
      return null;
    }

    // In production, load refresh token from secrets/DB
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    // TODO: Load refresh token from oauthTokens table
    this.gmail = google.gmail({ version: 'v1', auth: oauth2 });
    return this.gmail;
  }
}
