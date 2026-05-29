import { Module } from '@nestjs/common';
import { EntitiesModule } from '../entities/entities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WaitingOnService } from './waiting-on.service';

@Module({
  imports: [EntitiesModule, NotificationsModule],
  providers: [WaitingOnService],
  exports: [WaitingOnService],
})
export class WaitingOnModule {}
