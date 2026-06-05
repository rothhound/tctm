import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { gmail_v1 } from 'googleapis';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { gmailWatchState, signals } from '../../db/schema';
import { QUEUES } from '../../shared/queues.module';
import { isAutoSender } from './auto-senders';
import { EntitiesService } from '../../entities/entities.service';
import { resolveGmailClient, ResolvedGmail } from './gmail-auth';

type SignalInsert = typeof signals.$inferInsert;

// Forward markers across clients: Gmail/Apple ("Forwarded message"/"Begin forwarded message") and
// Outlook ("-----Original Message-----"). Used to detect forwards and split the note from the body.
const FORWARD_MARKER = /-{2,}\s*forwarded message|begin forwarded message|-{2,}\s*original message/i;

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private gmail: gmail_v1.Gmail | null = null;
  private readonly prioritySenders: string[];
  private readonly firmDomain: string | null;

  constructor(
    @Inject(DB) private readonly db: DbType,
    @InjectQueue(QUEUES.SIGNALS_EXTRACT) private readonly extractQueue: Queue,
    private readonly config: ConfigService,
    private readonly entities: EntitiesService,
  ) {
    // Priority senders get aggressive capture (judge bypassed). The list is `GMAIL_PRIORITY_SENDERS`
    // (comma-separated full emails like `dana@accel.com` or domains like `@accel.com`/`accel.com`),
    // PLUS the firm's own domain, derived from the impersonated mailbox (tctm@svangel.com → svangel.com).
    this.prioritySenders = (this.config.get<string>('GMAIL_PRIORITY_SENDERS', '') ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    const subject = (this.config.get<string>('GMAIL_IMPERSONATE_SUBJECT', '') ?? '').toLowerCase();
    this.firmDomain = subject.includes('@') ? subject.split('@')[1] : null;
  }

  /** True when the sender is on the priority list or in the firm's own domain. */
  private isPrioritySender(email: string): boolean {
    const e = email.toLowerCase();
    const domain = e.includes('@') ? e.split('@')[1] : '';
    if (this.firmDomain && domain === this.firmDomain) return true;
    return this.prioritySenders.some((entry) => {
      if (entry.startsWith('@')) return domain === entry.slice(1); // "@accel.com"
      if (!entry.includes('@')) return domain === entry; // bare "accel.com"
      return e === entry; // full "dana@accel.com"
    });
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

    const rawBody = this.extractBody(msg.data.payload);
    if (!rawBody.trim()) return;

    // The whole mailbox is a task dropbox — anything sent here (and not an auto-sender) is a
    // deliberate drop, so analyze it all. A forward is classified by intent (note vs bare); any other
    // direct email is a lenient `gmail_dropbox` capture (judge still runs) rather than cold inbound.
    const fwd = this.parseForward(rawBody);
    let subSource: string;
    let body: string;
    if (fwd.isForward) {
      subSource = fwd.note ? 'gmail_forward' : 'gmail_capture';
      body = this.buildForwardBody(fwd);
    } else {
      // Priority senders (list + firm domain) → aggressive capture; everyone else → lenient dropbox.
      subSource = this.isPrioritySender(authorEmail) ? 'gmail_priority' : 'gmail_dropbox';
      body = this.cleanBody(rawBody);
    }

    const signal: SignalInsert = {
      source: 'gmail',
      subSource,
      externalId: messageId,
      dedupKey: `gmail:${messageId}`,
      status: 'pending',
      payload: {
        title: subject || 'No subject',
        body,
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

  /**
   * Split a forwarded email into the forwarder's note (text above the first forward marker) and the
   * forwarded email itself. `note` empty = a bare forward (deliberate capture). Non-forward → isForward
   * false. The split point is the first marker so nested Fwd-of-Fwd content stays inside `forwarded`.
   */
  parseForward(body: string): { isForward: boolean; note: string; forwarded: string } {
    const m = FORWARD_MARKER.exec(body);
    if (!m) return { isForward: false, note: '', forwarded: '' };
    return { isForward: true, note: body.slice(0, m.index).trim(), forwarded: body.slice(m.index).trim() };
  }

  /** Labeled body so the extractor can weight the note over the forwarded content (Slack-style). */
  private buildForwardBody(fwd: { note: string; forwarded: string }): string {
    return [
      'This email was forwarded into your task inbox.',
      `Forwarder's note: ${fwd.note || '(none — forwarded as-is)'}`,
      '',
      'Forwarded email (source of the task):',
      fwd.forwarded,
    ].join('\n').slice(0, 4000);
  }

  cleanBody(body: string): string {
    // Forwarded emails: the forwarded original IS the payload — and it's frequently '>'-quoted and
    // sits below the forwarder's signature. Stripping quotes/sigs here would gut it (leaving only the
    // "Forwarded message" header), so keep the whole thing for forwards.
    if (FORWARD_MARKER.test(body)) {
      return body.trim().slice(0, 4000);
    }

    // Replies / direct mail: drop quoted history and signature blocks to reduce noise.
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

    let resolved: ResolvedGmail | null;
    try {
      resolved = resolveGmailClient(this.config);
    } catch (err: any) {
      this.logger.error(`Gmail auth misconfigured: ${err.message}`);
      return null;
    }
    if (!resolved) {
      this.logger.warn(
        'Gmail not configured — set GMAIL_SERVICE_ACCOUNT_KEY + GMAIL_IMPERSONATE_SUBJECT (domain-wide delegation) or GOOGLE_CLIENT_ID/SECRET + GMAIL_REFRESH_TOKEN — ingestion disabled',
      );
      return null;
    }

    this.gmail = resolved.client;
    this.logger.log(`Gmail client ready (auth: ${resolved.mode}${resolved.subject ? ` as ${resolved.subject}` : ''})`);
    return this.gmail;
  }
}
