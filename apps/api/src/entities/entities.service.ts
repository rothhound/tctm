import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, DbType } from '../db/db.module';
import { entities } from '../db/schema';

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger(EntitiesService.name);

  // Cached glossary XML — rebuilt at most once per hour
  private glossaryCache: { xml: string; builtAt: number } | null = null;
  private readonly GLOSSARY_TTL_MS = 60 * 60 * 1000; // 1h

  constructor(@Inject(DB) private readonly db: DbType) {}

  async renderGlossaryXml(): Promise<string> {
    if (this.glossaryCache && Date.now() - this.glossaryCache.builtAt < this.GLOSSARY_TTL_MS) {
      return this.glossaryCache.xml;
    }

    // For a single-user system, the full entity set will be small (hundreds, maybe low thousands).
    // If it grows beyond ~5k, switch to "top-N by recent interaction" instead of full set.
    const allEntities = await this.db
      .select()
      .from(entities)
      .orderBy(desc(entities.lastInteractionAt))
      .limit(2000);

    const xml = this.buildGlossaryXml(allEntities);
    this.glossaryCache = { xml, builtAt: Date.now() };
    this.logger.log(`Rebuilt entity glossary: ${allEntities.length} entities, ${xml.length} chars`);
    return xml;
  }

  invalidateGlossaryCache() {
    this.glossaryCache = null;
  }

  private buildGlossaryXml(rows: typeof entities.$inferSelect[]): string {
    const groups = {
      person: [] as typeof rows,
      company: [] as typeof rows,
      fund: [] as typeof rows,
      deal: [] as typeof rows,
    };
    for (const r of rows) {
      groups[r.type].push(r);
    }

    const renderEntity = (e: typeof rows[number]) => {
      const aliases = e.aliases.length ? `<aliases>${e.aliases.join(', ')}</aliases>` : '';
      const ctx = e.context ? `<context>${this.escapeXml(e.context)}</context>` : '';
      const emails = e.emails.length ? `<emails>${e.emails.join(', ')}</emails>` : '';
      return `  <${e.type} id="${e.id}">
    <name>${this.escapeXml(e.canonicalName)}</name>
    ${aliases}
    ${emails}
    ${ctx}
  </${e.type}>`;
    };

    return `<entities>
${rows.map(renderEntity).join('\n')}
</entities>`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================================
  // Resolve a mention to an entity (used post-extraction for fuzzy matching)
  // ============================================================================
  async resolveByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    const all = await this.db.select().from(entities);
    return all.find(e => e.emails.some(em => em.toLowerCase() === normalized));
  }
}
