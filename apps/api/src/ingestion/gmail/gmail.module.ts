import { Module } from '@nestjs/common';
import { EntitiesModule } from '../../entities/entities.module';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';
import { GmailWatchService } from './gmail-watch.service';

@Module({
  imports: [EntitiesModule],
  controllers: [GmailController],
  providers: [GmailService, GmailWatchService],
})
export class GmailModule {}
