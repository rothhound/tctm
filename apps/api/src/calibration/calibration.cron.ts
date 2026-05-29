import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CalibrationService } from './calibration.service';

@Injectable()
export class CalibrationCron {
  private readonly logger = new Logger(CalibrationCron.name);

  constructor(private readonly calibration: CalibrationService) {}

  // Sunday 9am Pacific (16:00 UTC)
  @Cron('0 16 * * 0')
  async weeklyCalibration() {
    this.logger.log('Running weekly calibration...');
    const report = await this.calibration.runCalibration();
    this.logger.log(
      `Calibration report: ${report.totalFeedback} feedback, ${report.patterns.length} patterns, ` +
        (report.newPromptVersionId ? `new prompt version created: ${report.newPromptVersionId}` : 'no prompt change suggested'),
    );
  }
}
