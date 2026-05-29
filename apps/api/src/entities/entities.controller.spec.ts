import { Test, TestingModule } from '@nestjs/testing';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { DB } from '../db/db.module';

describe('EntitiesController', () => {
  let controller: EntitiesController;
  let mockDb: any;
  let entitiesService: Partial<EntitiesService>;

  const mockEntity = {
    id: 'ent-1',
    type: 'person' as const,
    canonicalName: 'Jane Doe',
    aliases: ['JD'],
    context: 'LP at Fund X',
    emails: ['jane@fundx.com'],
    slackIds: [],
    notionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastInteractionAt: null,
  };

  const mockEntity2 = {
    id: 'ent-2',
    type: 'company' as const,
    canonicalName: 'Acme Corp',
    aliases: [],
    context: null,
    emails: [],
    slackIds: [],
    notionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastInteractionAt: null,
  };

  beforeEach(async () => {
    entitiesService = {
      invalidateGlossaryCache: jest.fn(),
    };

    // Chainable mock DB supporting:
    //   select().from(x)                          → list
    //   select().from(x).where(y)                 → findOne
    //   insert(x).values(y).returning()           → create
    //   update(x).set(y).where(z).returning()     → update
    //   delete(x).where(y)                        → delete
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockImplementation(() => {
          // Default: returns the full list (for list())
          // Override per-test for findOne via where()
          const result = [mockEntity, mockEntity2];
          return Object.assign(Promise.resolve(result), {
            where: jest.fn().mockResolvedValue([mockEntity]),
          });
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockEntity]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockEntity]),
          }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntitiesController],
      providers: [
        { provide: DB, useValue: mockDb },
        { provide: EntitiesService, useValue: entitiesService },
      ],
    }).compile();

    controller = module.get<EntitiesController>(EntitiesController);
  });

  it('lists all entities', async () => {
    const result = await controller.list();

    expect(mockDb.select).toHaveBeenCalled();
    expect(result).toEqual([mockEntity, mockEntity2]);
  });

  it('finds one entity by id', async () => {
    const result = await controller.findOne('ent-1');

    expect(mockDb.select).toHaveBeenCalled();
    expect(result).toEqual(mockEntity);
  });

  it('returns null when entity not found', async () => {
    // Override where() to return empty array
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await controller.findOne('nonexistent');

    expect(result).toBeNull();
  });

  it('creates an entity and invalidates glossary cache', async () => {
    const body = {
      type: 'person' as const,
      canonicalName: 'Jane Doe',
      aliases: ['JD'],
      context: 'LP at Fund X',
      emails: ['jane@fundx.com'],
    };

    const result = await controller.create(body);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(result).toEqual(mockEntity);
    expect(entitiesService.invalidateGlossaryCache).toHaveBeenCalled();
  });

  it('updates an entity and invalidates glossary cache', async () => {
    const body = { canonicalName: 'Jane Smith' };

    const result = await controller.update('ent-1', body);

    expect(mockDb.update).toHaveBeenCalled();
    expect(result).toEqual(mockEntity);
    expect(entitiesService.invalidateGlossaryCache).toHaveBeenCalled();
  });

  it('removes an entity and invalidates glossary cache', async () => {
    const result = await controller.remove('ent-1');

    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toEqual({ deleted: true });
    expect(entitiesService.invalidateGlossaryCache).toHaveBeenCalled();
  });
});
