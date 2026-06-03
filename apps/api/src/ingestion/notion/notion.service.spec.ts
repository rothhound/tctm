import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotionService } from './notion.service';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function jsonRes(body: any) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('NotionService', () => {
  let service: NotionService;
  const partnerUserId = 'user-partner-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) =>
              key === 'PARTNER_NOTION_USER_ID' ? partnerUserId : key === 'NOTION_API_KEY' ? 'ntn_test' : def ?? '',
          },
        },
      ],
    }).compile();

    service = module.get<NotionService>(NotionService);
    mockFetch.mockReset();
  });

  // detectMention / detectAssignment operate on a fetched page object (no network).
  describe('detectMention', () => {
    it('detects partner mention in rich_text', () => {
      const page = {
        properties: {
          Description: { type: 'rich_text', rich_text: [{ type: 'mention', mention: { user: { id: partnerUserId } } }] },
        },
      };
      expect(service.detectMention(page)).toBe(true);
    });

    it('detects partner in people property', () => {
      expect(service.detectMention({ properties: { Team: { type: 'people', people: [{ id: partnerUserId }] } } })).toBe(true);
    });

    it('returns false when partner not mentioned', () => {
      const page = { properties: { Description: { type: 'rich_text', rich_text: [{ type: 'text', plain_text: 'No mentions' }] } } };
      expect(service.detectMention(page)).toBe(false);
    });
  });

  describe('detectAssignment', () => {
    it('detects partner as assignee', () => {
      expect(service.detectAssignment({ properties: { Assignee: { type: 'people', people: [{ id: partnerUserId }] } } })).toBe(true);
    });

    it('detects partner as owner', () => {
      expect(service.detectAssignment({ properties: { Owner: { type: 'people', people: [{ id: partnerUserId }] } } })).toBe(true);
    });

    it('returns false when partner not assigned', () => {
      expect(service.detectAssignment({ properties: { Assignee: { type: 'people', people: [{ id: 'other-user' }] } } })).toBe(false);
    });
  });

  describe('toSignal — pages (fetched content)', () => {
    it('creates a signal from a page event when the partner is @mentioned in the body', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/pages/'))
          return jsonRes({ id: 'page-001', url: 'https://notion.so/page-001', last_edited_time: '2026-06-02T10:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: 'Q2 Review' }] } } });
        if (url.includes('/blocks/'))
          return jsonRes({ results: [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'mention', mention: { user: { id: partnerUserId } }, plain_text: '@partner' }, { type: 'text', plain_text: ' please send the deck' }] } }], has_more: false });
        if (url.includes('/users/')) return jsonRes({ name: 'Editor' });
        return jsonRes({});
      });

      const signal = await service.toSignal({
        type: 'page.content_updated',
        entity: { id: 'page-001', type: 'page' },
        data: {},
        authors: [{ id: 'user-editor' }],
        timestamp: '2026-06-02T10:00:00Z',
      });

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('notion_mention');
      expect(signal!.payload.title).toBe('Q2 Review');
      expect(signal!.payload.body).toContain('please send the deck');
    });

    it('creates an assigned signal from a people property', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/pages/'))
          return jsonRes({ id: 'page-002', last_edited_time: '2026-06-02T11:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: 'New Deal' }] }, Owner: { type: 'people', people: [{ id: partnerUserId }] } } });
        if (url.includes('/blocks/')) return jsonRes({ results: [], has_more: false });
        return jsonRes({});
      });

      const signal = await service.toSignal({ type: 'page.properties_updated', entity: { id: 'page-002' }, data: {} });
      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('notion_assigned');
    });

    it('returns null when the partner is neither mentioned nor assigned', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/pages/')) return jsonRes({ id: 'page-003', properties: { Name: { type: 'title', title: [{ plain_text: 'Unrelated' }] } } });
        if (url.includes('/blocks/')) return jsonRes({ results: [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', plain_text: 'just a body note' }] } }], has_more: false });
        return jsonRes({});
      });

      expect(await service.toSignal({ type: 'page.content_updated', entity: { id: 'page-003' }, data: {} })).toBeNull();
    });
  });

  describe('toSignal — comments (fetched content)', () => {
    it('creates a signal from a comment by fetching its text', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/comments?block_id='))
          return jsonRes({ results: [{ id: 'comment-1', rich_text: [{ type: 'text', plain_text: 'Please review the deck by Friday' }], created_by: { id: 'user-editor' }, created_time: '2026-06-02T12:00:00Z' }] });
        if (url.includes('/users/')) return jsonRes({ name: 'Editor' });
        return jsonRes({});
      });

      const signal = await service.toSignal({
        type: 'comment.created',
        entity: { id: 'comment-1', type: 'comment' },
        data: { page_id: 'page-001', parent: { type: 'page_id', page_id: 'page-001' } },
        authors: [{ id: 'user-editor' }],
        timestamp: '2026-06-02T12:00:00Z',
      });

      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('notion_mention');
      expect(signal!.dedupKey).toBe('notion:comment:comment-1');
      expect(signal!.payload.body).toContain('review the deck');
      expect(signal!.payload.author?.name).toBe('Editor');
    });

    it('returns null when the comment cannot be retrieved', async () => {
      mockFetch.mockImplementation(() => jsonRes({ results: [] }));
      expect(await service.toSignal({ type: 'comment.created', entity: { id: 'missing' }, data: { page_id: 'p' } })).toBeNull();
    });
  });

  it('returns null for unknown event types (no fetch)', async () => {
    expect(await service.toSignal({ type: 'database.updated' })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null (and does not fetch) when NOTION_API_KEY is not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotionService,
        { provide: ConfigService, useValue: { get: (k: string, def?: string) => (k === 'PARTNER_NOTION_USER_ID' ? partnerUserId : def ?? '') } },
      ],
    }).compile();
    const noKey = module.get<NotionService>(NotionService);

    expect(await noKey.toSignal({ type: 'comment.created', entity: { id: 'c1' }, data: { page_id: 'p' } })).toBeNull();
  });
});
