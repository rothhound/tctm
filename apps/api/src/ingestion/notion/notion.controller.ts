import { Body, Controller, Headers, HttpException, HttpStatus, Inject, Logger, Post, Req } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { DB, DbType } from '../../db/db.module';
import { signals } from '../../db/schema';
import { QUEUES } from '../../shared/queues.module';
import { Public } from '../../auth/decorators/public.decorator';
import { NotionService } from './notion.service';

@Public()
@Controller('webhooks/notion')
export class NotionController {
  private readonly logger = new Logger(NotionController.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DB) private readonly db: DbType,
    @InjectQueue(QUEUES.SIGNALS_EXTRACT) private readonly extractQueue: Queue,
    private readonly notionService: NotionService,
  ) {}

  @Post()
  async handleWebhook(
    @Req() req: FastifyRequest,
    @Headers('x-notion-signature') signature: string | undefined,
    @Body() body: any,
  ) {
    const event = body;

    // Arrival + shape (no titles/bodies — just keys). Debug-level: useful when diagnosing, quiet otherwise.
    this.logger.debug(
      `Notion webhook received: type=${event.type ?? '(verification handshake)'} ` +
        `keys=[${Object.keys(event ?? {}).join(',')}] dataKeys=[${Object.keys(event?.data ?? {}).join(',')}]`,
    );

    // One-time webhook setup: Notion POSTs { verification_token } when the subscription is
    // created. Handle it BEFORE signature verification — the handshake *establishes* the token,
    // so the request cannot (and must not) be HMAC-verified against a stored secret that may be
    // empty or stale. Capture it from the logs (dev console / `heroku logs`), paste into Notion's
    // Verify dialog, then set NOTION_VERIFICATION_TOKEN.
    if (event.verification_token) {
      this.logger.warn(`Notion webhook verification_token (set as NOTION_VERIFICATION_TOKEN): ${event.verification_token}`);
      return { ok: true };
    }

    // Every real (non-handshake) event MUST be HMAC-verified. Fail closed.
    const secret = this.config.get<string>('NOTION_VERIFICATION_TOKEN');
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('NOTION_VERIFICATION_TOKEN not set — rejecting unverifiable Notion webhook');
        throw new HttpException('Notion webhook verification not configured', HttpStatus.UNAUTHORIZED);
      }
      this.logger.warn('NOTION_VERIFICATION_TOKEN not set — accepting Notion webhook UNVERIFIED (dev only)');
    } else {
      const rawBodyBuf = (req as any).rawBody;
      const rawBody = typeof rawBodyBuf === 'string' ? rawBodyBuf : rawBodyBuf?.toString('utf-8');
      if (!signature || !rawBody) {
        throw new HttpException('Missing Notion signature', HttpStatus.UNAUTHORIZED);
      }
      this.verifySignature(signature, rawBody, secret);
    }

    if (!event.type) return { ok: true };

    setImmediate(() => {
      this.processEvent(event).catch((err) =>
        this.logger.error(`Notion event processing failed: ${err.message}`, err.stack),
      );
    });

    return { ok: true };
  }

  private verifySignature(signature: string, rawBody: string, secret: string): void {
    // Notion sends `X-Notion-Signature: sha256=<hex>` — HMAC-SHA256 of the raw body, keyed by the
    // webhook's verification_token (NOT the integration API key). Strip the scheme prefix before comparing.
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature.replace(/^(sha256=|v0=)/, '');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(provided);

    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      // Hashes, not secrets. If the hex differs entirely (not just the prefix), the key is wrong:
      // NOTION_VERIFICATION_TOKEN must be the webhook verification_token, not the integration API key.
      this.logger.warn(
        `Notion signature mismatch — received "${signature.slice(0, 16)}…", ` +
          `expected raw-body HMAC "${expected.slice(0, 12)}…". Verify NOTION_VERIFICATION_TOKEN is the ` +
          `webhook verification_token (not the API key).`,
      );
      throw new HttpException('Invalid Notion signature', HttpStatus.UNAUTHORIZED);
    }
  }

  private async processEvent(event: any): Promise<void> {
    const signal = await this.notionService.toSignal(event);
    if (!signal) {
      // Debug-level: expected for events not addressed to you (no @mention/assignment) or empty content.
      this.logger.debug(`Notion event ${event.type} produced no signal (not addressed to you, or empty content)`);
      return;
    }

    const inserted = await this.db
      .insert(signals)
      .values(signal)
      .onConflictDoNothing({ target: signals.dedupKey })
      .returning({ id: signals.id });

    if (inserted.length > 0) {
      this.logger.log(`Notion signal created (${signal.subSource}) → queued for extraction`);
      await this.extractQueue.add('extract', { signalId: inserted[0].id });
    } else {
      this.logger.log(`Notion signal ${signal.dedupKey} already exists — skipped (dedup)`);
    }
  }
}
