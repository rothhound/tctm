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
    // Pub/Sub must authenticate with an OIDC JWT (enable OIDC auth on the push subscription,
    // audience = GOOGLE_CLIENT_ID). Fail closed: a missing or invalid token is rejected.
    if (!authHeader) {
      this.logger.warn('Gmail push REJECTED — no Authorization header (enable OIDC auth on the push subscription)');
      throw new HttpException('Unauthenticated Pub/Sub push', HttpStatus.UNAUTHORIZED);
    }
    await this.verifyPubSubJwt(authHeader.replace('Bearer ', ''));

    if (!body.message?.data) {
      this.logger.log('Gmail push received (no message data — likely a subscription verification ping)');
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

    this.logger.log(`Gmail push received — historyId=${payload.historyId} (${payload.emailAddress ?? 'mailbox'})`);

    // Process asynchronously — Pub/Sub expects fast ack
    setImmediate(() => {
      this.gmailService
        .processHistoryNotification(payload.historyId!)
        .catch((err) => this.logger.error(`Gmail history processing failed: ${err.message}`, err.stack));
    });

    return { ok: true };
  }

  private async verifyPubSubJwt(token: string): Promise<void> {
    const audience = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!audience) {
      // No audience to check against → can't verify → reject rather than accept blindly.
      this.logger.error('GOOGLE_CLIENT_ID not set — cannot verify Gmail push audience; rejecting');
      throw new HttpException('Push verification not configured', HttpStatus.UNAUTHORIZED);
    }
    try {
      await this.oauth2Client.verifyIdToken({ idToken: token, audience });
    } catch (err) {
      this.logger.warn('Gmail push JWT verification failed — check the subscription OIDC audience equals GOOGLE_CLIENT_ID');
      throw new HttpException('Invalid Pub/Sub JWT', HttpStatus.UNAUTHORIZED);
    }
  }
}
