import { Body, Controller, Headers, HttpException, HttpStatus, Inject, Logger, Post, Req } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../../db/db.module';
import { signals } from '../../db/schema';
import { QUEUES } from '../../shared/queues.module';
import { SlackIngestionService } from './slack-ingestion.service';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Slack Events API endpoint.
 *
 * Security:
 * - Verify X-Slack-Signature HMAC on every request
 * - Reject events older than 5 minutes (replay protection)
 * - Only respond 200 after queueing — Slack requires <3s response
 *
 * Subscribed events: message.im, message.channels (filtered), app_mention, reaction_added
 */
@Public()
@Controller('webhooks/slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DB) private readonly db: DbType,
    @InjectQueue(QUEUES.SIGNALS_EXTRACT) private readonly extractQueue: Queue,
    private readonly slackIngestion: SlackIngestionService,
  ) {}

  @Post('events')
  async handleEvent(
    @Req() req: FastifyRequest,
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Body() body: any,
  ) {
    // Slack URL verification handshake
    if (body.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    // Signature verification — use raw body, not parsed
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      throw new HttpException('Missing raw body', HttpStatus.BAD_REQUEST);
    }
    this.verifySignature(signature, timestamp, typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8'));

    // Ack immediately; do not block on processing
    if (body.type === 'event_callback') {
      // Queue for async processing
      setImmediate(() => {
        this.processEvent(body.event).catch(err =>
          this.logger.error(`Slack event processing failed: ${err.message}`, err.stack),
        );
      });
    }

    return { ok: true };
  }

  private verifySignature(signature: string, timestamp: string, rawBody: string): void {
    if (!signature || !timestamp) {
      throw new HttpException('Missing Slack signature headers', HttpStatus.UNAUTHORIZED);
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) {
      throw new HttpException('Slack request too old', HttpStatus.UNAUTHORIZED);
    }

    const signingSecret = this.config.getOrThrow<string>('SLACK_SIGNING_SECRET');
    const baseString = `v0:${timestamp}:${rawBody}`;
    const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new HttpException('Invalid Slack signature', HttpStatus.UNAUTHORIZED);
    }
  }

  private async processEvent(event: any): Promise<void> {
    const signal = await this.slackIngestion.toSignal(event);
    if (!signal) return; // event filtered out (bot message, edit, etc.)

    // Insert with onConflict do nothing — dedup_key is unique
    const inserted = await this.db
      .insert(signals)
      .values(signal)
      .onConflictDoNothing({ target: signals.dedupKey })
      .returning({ id: signals.id });

    if (inserted.length === 0) {
      this.logger.log(`Slack signal ${signal.dedupKey} already exists, skipping`);
      return;
    }

    await this.extractQueue.add('extract', { signalId: inserted[0].id });
  }
}
