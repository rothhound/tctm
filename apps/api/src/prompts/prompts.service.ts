import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, max } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { promptVersions } from '../db/schema';

type PromptPurpose = 'extract' | 'judge';
type PromptVersion = typeof promptVersions.$inferSelect;

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  // In-memory cache: purpose → { prompt, fetchedAt }
  private cache = new Map<string, { prompt: PromptVersion; fetchedAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(@Inject(DB) private readonly db: DbType) {}

  /**
   * Get the active prompt for a given purpose. Cached for 5 minutes.
   */
  async getActivePrompt(purpose: PromptPurpose): Promise<PromptVersion> {
    const cached = this.cache.get(purpose);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      return cached.prompt;
    }

    const [row] = await this.db
      .select()
      .from(promptVersions)
      .where(and(eq(promptVersions.purpose, purpose), eq(promptVersions.active, true)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`No active prompt for purpose: ${purpose}`);
    }

    this.cache.set(purpose, { prompt: row, fetchedAt: Date.now() });
    return row;
  }

  /**
   * List all versions for a purpose, newest first.
   */
  async listVersions(purpose: PromptPurpose) {
    return this.db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.purpose, purpose))
      .orderBy(desc(promptVersions.version));
  }

  /**
   * Create a new (inactive) version.
   */
  async createVersion(
    purpose: PromptPurpose,
    content: string,
    metadata: PromptVersion['metadata'],
  ): Promise<PromptVersion> {
    // Get next version number
    const [latest] = await this.db
      .select({ maxVersion: max(promptVersions.version) })
      .from(promptVersions)
      .where(eq(promptVersions.purpose, purpose));

    const nextVersion = (latest?.maxVersion ?? 0) + 1;

    const [row] = await this.db
      .insert(promptVersions)
      .values({
        purpose,
        version: nextVersion,
        content,
        active: false,
        metadata,
      })
      .returning();

    this.logger.log(`Created prompt v${nextVersion} for ${purpose}`);
    return row;
  }

  /**
   * Activate a version (deactivate the currently active one).
   */
  async activate(id: string): Promise<PromptVersion> {
    const [target] = await this.db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, id));

    if (!target) throw new NotFoundException('Prompt version not found');

    // Deactivate current active for this purpose
    await this.db
      .update(promptVersions)
      .set({ active: false })
      .where(and(eq(promptVersions.purpose, target.purpose), eq(promptVersions.active, true)));

    // Activate target
    const [row] = await this.db
      .update(promptVersions)
      .set({ active: true })
      .where(eq(promptVersions.id, id))
      .returning();

    // Bust cache
    this.cache.delete(target.purpose);
    this.logger.log(`Activated prompt v${target.version} for ${target.purpose}`);

    return row;
  }

  /**
   * Record performance metrics for a version.
   */
  async recordPerformance(id: string, performance: NonNullable<PromptVersion['performance']>) {
    await this.db
      .update(promptVersions)
      .set({ performance })
      .where(eq(promptVersions.id, id));
  }

  /**
   * Bust cache for a purpose (called after calibration creates new version).
   */
  invalidateCache(purpose?: PromptPurpose) {
    if (purpose) {
      this.cache.delete(purpose);
    } else {
      this.cache.clear();
    }
  }
}
