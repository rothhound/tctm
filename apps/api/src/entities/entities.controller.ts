import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { entities } from '../db/schema';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesController {
  constructor(
    @Inject(DB) private readonly db: DbType,
    private readonly entitiesService: EntitiesService,
  ) {}

  @Get()
  async list() {
    return this.db.select().from(entities);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const [entity] = await this.db.select().from(entities).where(eq(entities.id, id));
    return entity ?? null;
  }

  @Post()
  async create(@Body() body: {
    type: 'person' | 'company' | 'fund' | 'deal';
    canonicalName: string;
    aliases?: string[];
    context?: string;
    emails?: string[];
    slackIds?: string[];
    notionId?: string;
  }) {
    const [row] = await this.db
      .insert(entities)
      .values({
        type: body.type,
        canonicalName: body.canonicalName,
        aliases: body.aliases ?? [],
        context: body.context ?? null,
        emails: body.emails ?? [],
        slackIds: body.slackIds ?? [],
        notionId: body.notionId ?? null,
      })
      .returning();
    this.entitiesService.invalidateGlossaryCache();
    return row;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<typeof entities.$inferInsert>) {
    const [row] = await this.db
      .update(entities)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(entities.id, id))
      .returning();
    this.entitiesService.invalidateGlossaryCache();
    return row;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.db.delete(entities).where(eq(entities.id, id));
    this.entitiesService.invalidateGlossaryCache();
    return { deleted: true };
  }
}
