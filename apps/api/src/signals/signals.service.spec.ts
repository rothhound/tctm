import { Test, TestingModule } from '@nestjs/testing';
import { SignalsService } from './signals.service';
import { DB } from '../db/db.module';

describe('SignalsService', () => {
  let service: SignalsService;
  let mockDb: any;

  const mockSignal = {
    source: 'slack' as const,
    subSource: 'slack_dm',
    externalId: 'C123:1716100000.000100',
    dedupKey: 'slack:C123:1716100000.000100',
    status: 'pending' as const,
    payload: {
      title: 'Slack DM from John',
      body: 'Can you send the deck?',
      author: { name: 'John', email: 'john@example.com' },
      occurredAt: '2026-05-19T10:00:00Z',
      raw: {},
    },
  };

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalsService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SignalsService>(SignalsService);
  });

  describe('insertWithDedup', () => {
    it('returns signal ID on successful insert', async () => {
      mockDb.returning.mockResolvedValue([{ id: 'sig-001' }]);

      const result = await service.insertWithDedup(mockSignal);
      expect(result).toBe('sig-001');
    });

    it('returns null when signal already exists (dedup)', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await service.insertWithDedup(mockSignal);
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns signal when found', async () => {
      const expected = { id: 'sig-001', ...mockSignal };
      mockDb.where.mockResolvedValue([expected]);

      const result = await service.findById('sig-001');
      expect(result).toEqual(expected);
    });

    it('returns null when not found', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
