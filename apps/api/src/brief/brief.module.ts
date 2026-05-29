import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BriefService } from './brief.service';
import { BriefCron } from './brief.cron';

@Module({
  imports: [NotificationsModule],
  providers: [BriefService, BriefCron],
})
export class BriefModule {}
