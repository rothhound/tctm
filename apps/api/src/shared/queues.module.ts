import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const QUEUES = {
  SIGNALS_EXTRACT: 'signals.extract',
  TASKS_DEDUPE: 'tasks.dedupe',
  WAITING_ON_RESOLVE: 'waiting_on.resolve',
  GMAIL_WATCH_RENEW: 'gmail.watch.renew',
  GRANOLA_POLL: 'granola.poll',
} as const;

export function redisConnection(config: ConfigService) {
  const url = config.get<string>('REDIS_URL');
  if (url) {
    // Heroku Redis provides REDIS_URL (rediss:// for TLS)
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
    };
  }
  return {
    host: config.get<string>('REDIS_HOST', '127.0.0.1'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get<string>('REDIS_PASSWORD'),
    maxRetriesPerRequest: null,
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config),
        defaultJobOptions: {
          removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: QUEUES.SIGNALS_EXTRACT,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      },
      {
        name: QUEUES.TASKS_DEDUPE,
        defaultJobOptions: { attempts: 2 },
      },
      {
        name: QUEUES.WAITING_ON_RESOLVE,
        defaultJobOptions: { attempts: 2 },
      },
      {
        name: QUEUES.GMAIL_WATCH_RENEW,
        defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 30000 } },
      },
      {
        name: QUEUES.GRANOLA_POLL,
        defaultJobOptions: { attempts: 2 },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
