import { Module } from '@nestjs/common';
import { PromptsModule } from '../prompts/prompts.module';
import { CalibrationService } from './calibration.service';
import { CalibrationCron } from './calibration.cron';

@Module({
  imports: [PromptsModule],
  providers: [CalibrationService, CalibrationCron],
  exports: [CalibrationService],
})
export class CalibrationModule {}
