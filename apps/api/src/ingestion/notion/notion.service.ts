import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { signals } from '../../db/schema';

type SignalInsert = typeof signals.$inferInsert;

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly partnerNotionUserId: string;

  constructor(private readonly config: ConfigService) {
    this.partnerNotionUserId = config.get<string>('PARTNER_NOTION_USER_ID', '');
  }

  async toSignal(event: any): Promise<SignalInsert | null> {
    const type = event.type;

    switch (type) {
      // Notion emits page.content_updated / page.properties_updated — there is no "page.updated".
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

  private fromPageEvent(event: any): SignalInsert | null {
    const page = event.page ?? event.data;
    if (!page) return null;

    const pageId = page.id ?? event.id;
    const lastEditedTime = page.last_edited_time ?? new Date().toISOString();
    const title = this.extractPageTitle(page);
    const body = this.extractPageContent(page);

    // Detect if partner is mentioned or assigned
    const isMentioned = this.detectMention(page);
    const isAssigned = this.detectAssignment(page);

    if (!isMentioned && !isAssigned) return null;

    const subSource = isAssigned ? 'notion_assigned' : 'notion_mention';

    return {
      source: 'notion',
      subSource,
      externalId: `${pageId}:${lastEditedTime}`,
      dedupKey: `notion:${pageId}:${lastEditedTime}`,
      status: 'pending',
      payload: {
        title: title || 'Notion page update',
        body: body.slice(0, 4000),
        author: {
          name: event.actor?.name ?? event.edited_by?.name,
          externalId: event.actor?.id ?? event.edited_by?.id,
        },
        url: page.url ?? `https://notion.so/${pageId?.replace(/-/g, '')}`,
        occurredAt: lastEditedTime,
        raw: event,
      },
    };
  }

  private fromCommentEvent(event: any): SignalInsert | null {
    const comment = event.comment ?? event.data;
    if (!comment) return null;

    const commentId = comment.id ?? event.id;
    const body = comment.rich_text?.map((t: any) => t.plain_text).join('') ?? '';

    // Check if comment mentions the partner
    const mentionsPartner = comment.rich_text?.some(
      (t: any) => t.type === 'mention' && t.mention?.user?.id === this.partnerNotionUserId,
    );

    if (!mentionsPartner && !body) return null;

    return {
      source: 'notion',
      subSource: 'notion_mention',
      externalId: commentId,
      dedupKey: `notion:comment:${commentId}`,
      status: 'pending',
      payload: {
        title: 'Notion comment',
        body,
        author: {
          name: comment.created_by?.name ?? event.actor?.name,
          externalId: comment.created_by?.id ?? event.actor?.id,
        },
        occurredAt: comment.created_time ?? new Date().toISOString(),
        raw: event,
      },
    };
  }

  private extractPageTitle(page: any): string {
    // Notion pages have title in properties
    const props = page.properties ?? {};
    for (const prop of Object.values(props) as any[]) {
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map((t: any) => t.plain_text).join('');
      }
    }
    return '';
  }

  private extractPageContent(page: any): string {
    // For webhook events, the full page content is not included.
    // We rely on title + properties for now. Full block fetch would require API call.
    const parts: string[] = [];
    const props = page.properties ?? {};
    for (const [key, prop] of Object.entries(props) as [string, any][]) {
      if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
        parts.push(`${key}: ${prop.rich_text.map((t: any) => t.plain_text).join('')}`);
      }
    }
    return parts.join('\n');
  }

  detectMention(page: any): boolean {
    if (!this.partnerNotionUserId) return false;
    const props = page.properties ?? {};
    for (const prop of Object.values(props) as any[]) {
      if (prop.type === 'rich_text') {
        for (const rt of prop.rich_text ?? []) {
          if (rt.type === 'mention' && rt.mention?.user?.id === this.partnerNotionUserId) {
            return true;
          }
        }
      }
      if (prop.type === 'people') {
        for (const person of prop.people ?? []) {
          if (person.id === this.partnerNotionUserId) return true;
        }
      }
    }
    return false;
  }

  detectAssignment(page: any): boolean {
    if (!this.partnerNotionUserId) return false;
    const props = page.properties ?? {};
    for (const [key, prop] of Object.entries(props) as [string, any][]) {
      const isAssignee = /assign|owner/i.test(key);
      if (isAssignee && prop.type === 'people') {
        return prop.people?.some((p: any) => p.id === this.partnerNotionUserId) ?? false;
      }
    }
    return false;
  }
}
