import { Module } from '@nestjs/common';
import { SignalsModule } from '../../signals/signals.module';
import { SlackController } from './slack.controller';
import { SlackIngestionService } from './slack-ingestion.service';

@Module({
  imports: [SignalsModule],
  controllers: [SlackController],
  providers: [SlackIngestionService],
})
export class SlackModule {}
