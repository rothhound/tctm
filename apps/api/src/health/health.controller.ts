import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { DB, DbType } from '../db/db.module';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  private readonly redis: Redis;

  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  @Public()
  @Get()
  async check() {
    const results: Record<string, string> = {};

    try {
      await this.db.execute(sql`SELECT 1`);
      results.db = 'ok';
    } catch {
      results.db = 'error';
    }

    try {
      await this.redis.ping();
      results.redis = 'ok';
    } catch {
      results.redis = 'error';
    }

    return results;
  }
}
