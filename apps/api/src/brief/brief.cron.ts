import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BriefService } from './brief.service';

@Injectable()
export class BriefCron {
  private readonly logger = new Logger(BriefCron.name);

  constructor(
    private readonly briefService: BriefService,
    private readonly config: ConfigService,
  ) {}

  // 7am Pacific (14:00 UTC), weekdays. Off by default — enable with BRIEF_ENABLED=true.
  @Cron('0 14 * * 1-5')
  async sendDailyBrief() {
    if (this.config.get<string>('BRIEF_ENABLED') !== 'true') return; // disabled unless explicitly enabled
    this.logger.log('Sending daily brief...');
    await this.briefService.sendDailyBrief();
  }
}
