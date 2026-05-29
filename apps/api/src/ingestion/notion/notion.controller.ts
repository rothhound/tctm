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
    const rawBodyBuf = (req as any).rawBody;
    if (rawBodyBuf && signature) {
      const rawBody = typeof rawBodyBuf === 'string' ? rawBodyBuf : rawBodyBuf.toString('utf-8');
      this.verifySignature(signature, rawBody);
    }

    const event = body;
    if (!event.type) return { ok: true };

    setImmediate(() => {
      this.processEvent(event).catch((err) =>
        this.logger.error(`Notion event processing failed: ${err.message}`, err.stack),
      );
    });

    return { ok: true };
  }

  private verifySignature(signature: string, rawBody: string): void {
    const secret = this.config.get<string>('NOTION_VERIFICATION_TOKEN');
    if (!secret) return; // Skip verification if not configured

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature.replace('v0=', ''));

    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new HttpException('Invalid Notion signature', HttpStatus.UNAUTHORIZED);
    }
  }

  private async processEvent(event: any): Promise<void> {
    const signal = await this.notionService.toSignal(event);
    if (!signal) return;

    const inserted = await this.db
      .insert(signals)
      .values(signal)
      .onConflictDoNothing({ target: signals.dedupKey })
      .returning({ id: signals.id });

    if (inserted.length > 0) {
      await this.extractQueue.add('extract', { signalId: inserted[0].id });
    }
  }
}
