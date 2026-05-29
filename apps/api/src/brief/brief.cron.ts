import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BriefService } from './brief.service';

@Injectable()
export class BriefCron {
  private readonly logger = new Logger(BriefCron.name);

  constructor(private readonly briefService: BriefService) {}

  // 7am Pacific (14:00 UTC) — configurable via env in production
  @Cron('0 14 * * 1-5')
  async sendDailyBrief() {
    this.logger.log('Sending daily brief...');
    await this.briefService.sendDailyBrief();
  }
}
