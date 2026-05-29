import { Module } from '@nestjs/common';
import { EntitiesModule } from '../entities/entities.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromptsModule } from '../prompts/prompts.module';
import { ExtractorService } from './extractor.service';
import { JudgeService } from './judge.service';
import { SignalExtractProcessor } from './extraction.processor';

@Module({
  imports: [EntitiesModule, TasksModule, NotificationsModule, PromptsModule],
  providers: [ExtractorService, JudgeService, SignalExtractProcessor],
  exports: [ExtractorService, JudgeService],
})
export class ExtractionModule {}
