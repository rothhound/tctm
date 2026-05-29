import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { DB } from '../db/db.module';

describe('PromptsService', () => {
  let service: PromptsService;
  let selectResults: any[];

  const mockPrompt = {
    id: 'pv-001',
    purpose: 'extract',
    version: 1,
    content: 'You are a task extraction assistant...',
    active: true,
    metadata: { createdBy: 'seed' },
    performance: null,
    createdAt: new Date(),
  };

  let mockDb: any;

  beforeEach(async () => {
    selectResults = [];

    // where() must be thenable (for destructuring) AND chainable (for .limit/.orderBy)
    const makeWhere = () => jest.fn().mockImplementation(() => {
      const result = Promise.resolve(selectResults.shift() ?? []);
      (result as any).limit = jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? []));
      (result as any).orderBy = jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? []));
      return result;
    });

    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: makeWhere(),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? [])),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? [])),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptsService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get<PromptsService>(PromptsService);
  });

  describe('getActivePrompt', () => {
    it('returns active prompt and caches it', async () => {
      // getActivePrompt: select().from().where().limit()
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockPrompt]),
          }),
        }),
      });

      const result = await service.getActivePrompt('extract');
      expect(result.id).toBe('pv-001');
      expect(result.active).toBe(true);

      // Second call should hit cache (no new DB query)
      const result2 = await service.getActivePrompt('extract');
      expect(result2.id).toBe('pv-001');
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('throws when no active prompt exists', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.getActivePrompt('judge')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createVersion', () => {
    it('creates a new inactive version with incremented number', async () => {
      // createVersion does: select({max}).from().where() then insert().values().returning()
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ maxVersion: 2 }]),
        }),
      });
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockPrompt, id: 'pv-003', version: 3, active: false }]),
        }),
      });

      const result = await service.createVersion('extract', 'new prompt content', {
        createdBy: 'calibration',
        reason: 'Weekly tuning',
      });

      expect(result.version).toBe(3);
      expect(result.active).toBe(false);
    });
  });

  describe('activate', () => {
    it('deactivates old and activates new', async () => {
      // activate does: select().from().where() then update.set.where (deactivate) then update.set.where.returning (activate)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockPrompt]),
        }),
      });

      let updateCallCount = 0;
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            updateCallCount++;
            if (updateCallCount === 1) return Promise.resolve(undefined);
            return { returning: jest.fn().mockResolvedValue([{ ...mockPrompt, active: true }]) };
          }),
        }),
      });

      const result = await service.activate('pv-001');
      expect(result.active).toBe(true);
    });

    it('throws when version not found', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });
      await expect(service.activate('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('invalidateCache', () => {
    it('clears cache for specific purpose', async () => {
      const makeSelectMock = () => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockPrompt]),
          }),
        }),
      });
      mockDb.select.mockReturnValueOnce(makeSelectMock());
      mockDb.select.mockReturnValueOnce(makeSelectMock());

      await service.getActivePrompt('extract');
      service.invalidateCache('extract');

      // Should query DB again after invalidation
      await service.getActivePrompt('extract');
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });
  });
});
