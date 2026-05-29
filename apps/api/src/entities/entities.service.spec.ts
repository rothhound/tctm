import { Test, TestingModule } from '@nestjs/testing';
import { EntitiesService } from './entities.service';
import { DB } from '../db/db.module';

describe('EntitiesService', () => {
  let service: EntitiesService;
  let mockDb: any;

  const mockEntities = [
    {
      id: 'ent-001',
      type: 'person' as const,
      canonicalName: 'Roelof Botha',
      aliases: ['Roelof'],
      context: 'Partner at Sequoia',
      emails: ['roelof@sequoiacap.com'],
      slackIds: [],
      notionId: null,
      relatedEntityIds: ['ent-002'],
      metadata: {},
      lastInteractionAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ent-002',
      type: 'company' as const,
      canonicalName: 'Sequoia Capital',
      aliases: ['Sequoia'],
      context: 'Top-tier VC',
      emails: [],
      slackIds: [],
      notionId: null,
      relatedEntityIds: [],
      metadata: {},
      lastInteractionAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(mockEntities),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitiesService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get<EntitiesService>(EntitiesService);
  });

  describe('renderGlossaryXml', () => {
    it('renders entities as XML', async () => {
      const xml = await service.renderGlossaryXml();

      expect(xml).toContain('<entities>');
      expect(xml).toContain('</entities>');
      expect(xml).toContain('Roelof Botha');
      expect(xml).toContain('Sequoia Capital');
      expect(xml).toContain('id="ent-001"');
    });

    it('caches the glossary for 1 hour', async () => {
      await service.renderGlossaryXml();
      await service.renderGlossaryXml();

      // DB should only be queried once due to caching
      expect(mockDb.limit).toHaveBeenCalledTimes(1);
    });

    it('rebuilds after cache invalidation', async () => {
      await service.renderGlossaryXml();
      service.invalidateGlossaryCache();
      await service.renderGlossaryXml();

      expect(mockDb.limit).toHaveBeenCalledTimes(2);
    });

    it('escapes XML special characters', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          ...mockEntities[0],
          canonicalName: 'R&D <Team>',
          context: 'Works on "special" projects',
        },
      ]);
      service.invalidateGlossaryCache();

      const xml = await service.renderGlossaryXml();
      expect(xml).toContain('R&amp;D &lt;Team&gt;');
      expect(xml).toContain('&quot;special&quot;');
    });
  });

  describe('resolveByEmail', () => {
    it('resolves entity by email (case-insensitive)', async () => {
      mockDb.limit = undefined; // resolveByEmail doesn't use limit
      mockDb.from.mockReturnThis();
      // Override select chain for resolveByEmail which calls select().from(entities) without orderBy/limit
      mockDb.select.mockReturnValue({
        from: jest.fn().mockResolvedValue(mockEntities),
      });

      const result = await service.resolveByEmail('Roelof@SequoiaCap.com');
      expect(result).toBeDefined();
      expect(result!.id).toBe('ent-001');
    });

    it('returns undefined for unknown email', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockResolvedValue(mockEntities),
      });

      const result = await service.resolveByEmail('unknown@example.com');
      expect(result).toBeUndefined();
    });
  });
});
