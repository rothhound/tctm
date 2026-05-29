import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotionService } from './notion.service';

describe('NotionService', () => {
  let service: NotionService;
  const partnerUserId = 'user-partner-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotionService,
        {
          provide: ConfigService,
          useValue: { get: (key: string, def?: string) => key === 'PARTNER_NOTION_USER_ID' ? partnerUserId : def ?? '' },
        },
      ],
    }).compile();

    service = module.get<NotionService>(NotionService);
  });

  describe('detectMention', () => {
    it('detects partner mention in rich_text', () => {
      const page = {
        properties: {
          Description: {
            type: 'rich_text',
            rich_text: [{ type: 'mention', mention: { user: { id: partnerUserId } } }],
          },
        },
      };
      expect(service.detectMention(page)).toBe(true);
    });

    it('detects partner in people property', () => {
      const page = {
        properties: {
          Team: { type: 'people', people: [{ id: partnerUserId }] },
        },
      };
      expect(service.detectMention(page)).toBe(true);
    });

    it('returns false when partner not mentioned', () => {
      const page = {
        properties: {
          Description: {
            type: 'rich_text',
            rich_text: [{ type: 'text', plain_text: 'No mentions' }],
          },
        },
      };
      expect(service.detectMention(page)).toBe(false);
    });
  });

  describe('detectAssignment', () => {
    it('detects partner as assignee', () => {
      const page = {
        properties: {
          Assignee: { type: 'people', people: [{ id: partnerUserId }] },
        },
      };
      expect(service.detectAssignment(page)).toBe(true);
    });

    it('detects partner as owner', () => {
      const page = {
        properties: {
          Owner: { type: 'people', people: [{ id: partnerUserId }] },
        },
      };
      expect(service.detectAssignment(page)).toBe(true);
    });

    it('returns false when partner not assigned', () => {
      const page = {
        properties: {
          Assignee: { type: 'people', people: [{ id: 'other-user' }] },
        },
      };
      expect(service.detectAssignment(page)).toBe(false);
    });
  });

  describe('toSignal', () => {
    it('creates signal from page.updated with mention', async () => {
      const event = {
        type: 'page.updated',
        page: {
          id: 'page-001',
          last_edited_time: '2026-05-19T10:00:00Z',
          url: 'https://notion.so/page-001',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Q2 Review' }] },
            Notes: {
              type: 'rich_text',
              rich_text: [{ type: 'mention', mention: { user: { id: partnerUserId } }, plain_text: '@partner' }],
            },
          },
        },
        actor: { name: 'Editor', id: 'user-editor' },
      };

      const signal = await service.toSignal(event);
      expect(signal).not.toBeNull();
      expect(signal!.source).toBe('notion');
      expect(signal!.subSource).toBe('notion_mention');
      expect(signal!.payload.title).toBe('Q2 Review');
    });

    it('creates signal from page with assignment', async () => {
      const event = {
        type: 'page.created',
        page: {
          id: 'page-002',
          last_edited_time: '2026-05-19T11:00:00Z',
          url: 'https://notion.so/page-002',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'New Deal' }] },
            Owner: { type: 'people', people: [{ id: partnerUserId }] },
          },
        },
      };

      const signal = await service.toSignal(event);
      expect(signal).not.toBeNull();
      expect(signal!.subSource).toBe('notion_assigned');
    });

    it('returns null for page without mention or assignment', async () => {
      const event = {
        type: 'page.updated',
        page: {
          id: 'page-003',
          last_edited_time: '2026-05-19T12:00:00Z',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Unrelated' }] } },
        },
      };

      const signal = await service.toSignal(event);
      expect(signal).toBeNull();
    });

    it('returns null for unknown event types', async () => {
      const signal = await service.toSignal({ type: 'database.updated' });
      expect(signal).toBeNull();
    });
  });
});
