import { Body, Controller, Headers, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { Public } from '../../auth/decorators/public.decorator';
import { GmailService } from './gmail.service';

/**
 * Gmail Pub/Sub push endpoint.
 *
 * Google Cloud Pub/Sub sends push notifications here when new emails arrive.
 * Each notification contains a base64-encoded message with the historyId.
 *
 * Security: Verify the JWT in the Authorization header against Google's public keys.
 */
@Public()
@Controller('webhooks/gmail')
export class GmailController {
  private readonly logger = new Logger(GmailController.name);
  private readonly oauth2Client: OAuth2Client;

  constructor(
    private readonly gmailService: GmailService,
    private readonly config: ConfigService,
  ) {
    this.oauth2Client = new OAuth2Client();
  }

  @Post('push')
  async handlePush(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { message?: { data?: string; messageId?: string }; subscription?: string },
  ) {
    // Verify JWT from Pub/Sub
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      await this.verifyPubSubJwt(token);
    }

    if (!body.message?.data) {
      return { ok: true };
    }

    // Decode Pub/Sub message
    const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
    let payload: { emailAddress?: string; historyId?: string };
    try {
      payload = JSON.parse(decoded);
    } catch {
      this.logger.warn('Invalid Pub/Sub message payload');
      return { ok: true };
    }

    if (!payload.historyId) {
      return { ok: true };
    }

    // Process asynchronously — Pub/Sub expects fast ack
    setImmediate(() => {
      this.gmailService
        .processHistoryNotification(payload.historyId!)
        .catch((err) => this.logger.error(`Gmail history processing failed: ${err.message}`, err.stack));
    });

    return { ok: true };
  }

  private async verifyPubSubJwt(token: string): Promise<void> {
    try {
      await this.oauth2Client.verifyIdToken({
        idToken: token,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
      });
    } catch (err) {
      throw new HttpException('Invalid Pub/Sub JWT', HttpStatus.UNAUTHORIZED);
    }
  }
}
