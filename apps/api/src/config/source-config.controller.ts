import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { sourceConfig } from '../db/schema';

@Controller('source-config')
export class SourceConfigController {
  constructor(@Inject(DB) private readonly db: DbType) {}

  @Get()
  async list() {
    return this.db.select().from(sourceConfig);
  }

  @Patch(':source')
  async update(
    @Param('source') source: string,
    @Body() body: { enabled?: boolean; thresholds?: any; filters?: any },
  ) {
    const updates: any = { updatedAt: new Date() };
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.thresholds) updates.thresholds = body.thresholds;
    if (body.filters) updates.filters = body.filters;

    const [row] = await this.db
      .update(sourceConfig)
      .set(updates)
      .where(eq(sourceConfig.source, source))
      .returning();

    return row;
  }
}
