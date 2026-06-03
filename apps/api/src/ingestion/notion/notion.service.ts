import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { signals } from '../../db/schema';

type SignalInsert = typeof signals.$inferInsert;

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_BLOCK_PAGES = 3; // top-level children pages (≤300 blocks) — bounds API calls per event

/**
 * Notion webhooks carry only metadata (an `entity` id + a `data` envelope), NOT page/comment content.
 * So on every event we fetch the actual content from the Notion REST API using NOTION_API_KEY (the
 * integration's Internal Integration Secret), then build the signal from that.
 *
 * Real webhook shape (observed):
 *   { type, entity: { id, type }, data: { page_id, parent }, authors: [{ id }], timestamp, ... }
 */
@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly partnerNotionUserId: string;
  private readonly apiKey: string;
  private readonly userNameCache = new Map<string, string | undefined>();

  constructor(private readonly config: ConfigService) {
    this.partnerNotionUserId = config.get<string>('PARTNER_NOTION_USER_ID', '');
    this.apiKey = config.get<string>('NOTION_API_KEY', '');
  }

  async toSignal(event: any): Promise<SignalInsert | null> {
    switch (event?.type) {
      case 'page.created':
      case 'page.content_updated':
      case 'page.properties_updated':
        return this.fromPageEvent(event);
      case 'comment.created':
        return this.fromCommentEvent(event);
      default:
        return null;
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  private async fromCommentEvent(event: any): Promise<SignalInsert | null> {
    const commentId = event.entity?.id;
    const pageId = event.data?.page_id;
    if (!commentId) return null;

    const comment = await this.fetchComment(event);
    if (!comment) return null; // fetchComment logs the detailed reason

    const body = this.richTextToPlain(comment.rich_text).trim();
    if (!body) return null;

    const authorId = comment.created_by?.id ?? event.authors?.[0]?.id;
    const authorName = authorId ? await this.fetchUserName(authorId) : undefined;

    return {
      source: 'notion',
      subSource: 'notion_mention',
      externalId: commentId,
      dedupKey: `notion:comment:${commentId}`,
      status: 'pending',
      payload: {
        title: 'Notion comment',
        body: body.slice(0, 4000),
        author: authorId ? { name: authorName, externalId: authorId } : undefined,
        url: pageId ? `https://notion.so/${String(pageId).replace(/-/g, '')}` : undefined,
        occurredAt: comment.created_time ?? event.timestamp ?? new Date().toISOString(),
        raw: { event, comment },
      },
    };
  }

  /** List comments on the comment's parent block/page and find the one this event refers to. */
  private async fetchComment(event: any): Promise<any | null> {
    const commentId = event.entity?.id;
    const parent = event.data?.parent ?? {};
    // Inline comments hang off a specific block; page-level ones off the page. Try every id we're given.
    const candidates = [parent.block_id, parent.page_id, parent.id, event.data?.page_id].filter(
      (v, i, a) => v && a.indexOf(v) === i,
    );

    const tried: string[] = [];
    for (const blockId of candidates) {
      const data = await this.notionGet<any>(`/comments?block_id=${blockId}&page_size=100`);
      const results: any[] = data?.results ?? [];
      tried.push(`${blockId}:${data ? results.length : 'ERR'}`); // ERR = HTTP error (see preceding API log)
      const found = results.find((c: any) => c.id === commentId);
      if (found) return found;
    }

    this.logger.warn(
      `Notion comment ${commentId} not found — tried block_ids [${tried.join(', ')}], ` +
        `parentKeys=[${Object.keys(parent).join(',')}]. (ERR=API error; 0=no comments returned for that block.)`,
    );
    return null;
  }

  // ── Pages ──────────────────────────────────────────────────────────────────
  private async fromPageEvent(event: any): Promise<SignalInsert | null> {
    const pageId = event.entity?.id ?? event.page?.id ?? event.data?.id;
    if (!pageId) return null;

    const page = await this.fetchPage(pageId);
    if (!page) {
      this.logger.warn(`Notion page ${pageId} not retrievable — check NOTION_API_KEY + integration access`);
      return null;
    }

    const blocks = await this.fetchBlocks(pageId);

    // A page becomes a task only if it's addressed to you — assigned, or you're @mentioned in a
    // property or the body. Otherwise every edit on a connected page would flood the inbox.
    const isAssigned = this.detectAssignment(page);
    const isMentioned = this.detectMention(page) || this.blocksMentionPartner(blocks);
    if (!isMentioned && !isAssigned) return null;

    const title = this.extractPageTitle(page) || 'Notion page update';
    const body = [this.extractRichTextProps(page), this.blocksToText(blocks)].filter(Boolean).join('\n').slice(0, 4000);
    const lastEdited = page.last_edited_time ?? event.timestamp ?? new Date().toISOString();
    const editorId = event.authors?.[0]?.id ?? page.last_edited_by?.id;
    const editorName = editorId ? await this.fetchUserName(editorId) : undefined;

    return {
      source: 'notion',
      subSource: isAssigned ? 'notion_assigned' : 'notion_mention',
      externalId: `${pageId}:${lastEdited}`,
      dedupKey: `notion:${pageId}:${lastEdited}`,
      status: 'pending',
      payload: {
        title,
        body,
        author: editorId ? { name: editorName, externalId: editorId } : undefined,
        url: page.url ?? `https://notion.so/${String(pageId).replace(/-/g, '')}`,
        occurredAt: lastEdited,
        raw: { event },
      },
    };
  }

  private async fetchPage(pageId: string): Promise<any | null> {
    return this.notionGet<any>(`/pages/${pageId}`);
  }

  /** Top-level block children (bounded). Nested blocks (toggles/columns) are not recursed for now. */
  private async fetchBlocks(pageId: string): Promise<any[]> {
    const all: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < MAX_BLOCK_PAGES; i++) {
      const q = cursor ? `?start_cursor=${cursor}&page_size=100` : `?page_size=100`;
      const data = await this.notionGet<any>(`/blocks/${pageId}/children${q}`);
      if (!data?.results) break;
      all.push(...data.results);
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return all;
  }

  // ── Notion REST ──────────────────────────────────────────────────────────────
  private async notionGet<T>(path: string): Promise<T | null> {
    if (!this.apiKey) {
      this.logger.warn('NOTION_API_KEY not set — cannot fetch Notion content');
      return null;
    }
    try {
      const res = await fetch(`${NOTION_API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        this.logger.warn(`Notion API ${path} → ${res.status} ${res.statusText}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err: any) {
      this.logger.warn(`Notion API ${path} failed: ${err.message}`);
      return null;
    }
  }

  private async fetchUserName(userId: string): Promise<string | undefined> {
    if (this.userNameCache.has(userId)) return this.userNameCache.get(userId);
    const user = await this.notionGet<any>(`/users/${userId}`);
    const name = user?.name ?? undefined;
    this.userNameCache.set(userId, name);
    return name;
  }

  // ── rich_text + block helpers ─────────────────────────────────────────────────
  private richTextToPlain(richText: any[] | undefined): string {
    return (richText ?? []).map((t) => t.plain_text ?? '').join('');
  }

  private richTextMentionsPartner(richText: any[] | undefined): boolean {
    if (!this.partnerNotionUserId) return false;
    return (richText ?? []).some((t) => t.type === 'mention' && t.mention?.user?.id === this.partnerNotionUserId);
  }

  /** A block's rich_text lives under the block-type key (paragraph, heading_1, to_do, …). */
  private blockRichText(block: any): any[] {
    const inner = block?.[block?.type];
    return Array.isArray(inner?.rich_text) ? inner.rich_text : [];
  }

  private blocksToText(blocks: any[]): string {
    return blocks
      .map((b) => this.richTextToPlain(this.blockRichText(b)))
      .filter((s) => s.trim())
      .join('\n');
  }

  private blocksMentionPartner(blocks: any[]): boolean {
    return blocks.some((b) => this.richTextMentionsPartner(this.blockRichText(b)));
  }

  private extractPageTitle(page: any): string {
    const props = page.properties ?? {};
    for (const prop of Object.values(props) as any[]) {
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map((t: any) => t.plain_text).join('');
      }
    }
    return '';
  }

  private extractRichTextProps(page: any): string {
    const parts: string[] = [];
    const props = page.properties ?? {};
    for (const [key, prop] of Object.entries(props) as [string, any][]) {
      if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
        parts.push(`${key}: ${this.richTextToPlain(prop.rich_text)}`);
      }
    }
    return parts.join('\n');
  }

  detectMention(page: any): boolean {
    if (!this.partnerNotionUserId) return false;
    const props = page.properties ?? {};
    for (const prop of Object.values(props) as any[]) {
      if (prop.type === 'rich_text' && this.richTextMentionsPartner(prop.rich_text)) return true;
      if (prop.type === 'people' && (prop.people ?? []).some((p: any) => p.id === this.partnerNotionUserId)) return true;
    }
    return false;
  }

  detectAssignment(page: any): boolean {
    if (!this.partnerNotionUserId) return false;
    const props = page.properties ?? {};
    for (const [key, prop] of Object.entries(props) as [string, any][]) {
      if (/assign|owner/i.test(key) && prop.type === 'people') {
        return (prop.people ?? []).some((p: any) => p.id === this.partnerNotionUserId);
      }
    }
    return false;
  }
}
