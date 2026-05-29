import { Module } from '@nestjs/common';
import { SnoozeService } from './snooze.service';
import { SnoozeController } from './snooze.controller';

@Module({
  controllers: [SnoozeController],
  providers: [SnoozeService],
})
export class SnoozeModule {}
