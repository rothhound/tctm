import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('push')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('subscribe')
  async subscribe(
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.notifications.subscribe(body.endpoint, body.keys.p256dh, body.keys.auth);
    return { subscribed: true };
  }

  @Delete('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.notifications.unsubscribe(body.endpoint);
  }
}
