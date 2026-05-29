import { Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from '../../shared/queues.module';
import { GranolaService, GranolaPollProcessor } from './granola.service';

@Module({
  providers: [GranolaService, GranolaPollProcessor],
})
export class GranolaModule implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUES.GRANOLA_POLL) private readonly pollQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const apiKey = this.config.get<string>('GRANOLA_API_KEY');
    if (!apiKey) return;

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
