import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from '../../shared/queues.module';
import { GranolaService, GranolaPollProcessor, parseGranolaFolderIds } from './granola.service';

@Module({
  providers: [GranolaService, GranolaPollProcessor],
})
export class GranolaModule implements OnModuleInit {
  private readonly logger = new Logger(GranolaModule.name);

  constructor(
    @InjectQueue(QUEUES.GRANOLA_POLL) private readonly pollQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const apiKey = this.config.get<string>('GRANOLA_API_KEY');
    if (!apiKey) return;

    // No folder to track → don't schedule the poll at all (avoids logging a skip every 30s).
    if (parseGranolaFolderIds(this.config.get<string>('GRANOLA_FOLDER_IDS')).length === 0) {
      this.logger.warn('Granola polling disabled — no folder to track (set GRANOLA_FOLDER_IDS)');
      return;
    }

    // Set up repeatable job — every 30 seconds
    await this.pollQueue.add(
      'poll',
      {},
      {
        repeat: { every: 30_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );
  }
}
