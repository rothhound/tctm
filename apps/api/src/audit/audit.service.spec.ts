import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { DB } from '../db/db.module';

describe('AuditService', () => {
  let service: AuditService;
  let mockDb: any;

  const mockAuditEntries = [
    { id: 'audit-1', signalId: 'sig-001', purpose: 'extract', model: 'claude-opus-4-7', inputTokens: 500, outputTokens: 200 },
    { id: 'audit-2', signalId: 'sig-001', purpose: 'judge', model: 'claude-haiku-4-5', inputTokens: 200, outputTokens: 30 },
  ];

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(mockAuditEntries),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('findBySignalId', () => {
    it('returns audit entries for a signal', async () => {
      mockDb.orderBy.mockResolvedValue(mockAuditEntries);

      const result = await service.findBySignalId('sig-001');
      expect(result).toHaveLength(2);
      expect(result[0].purpose).toBe('extract');
    });
  });

  describe('findByPurpose', () => {
    it('returns audit entries filtered by purpose', async () => {
      mockDb.limit.mockResolvedValue([mockAuditEntries[0]]);

      const result = await service.findByPurpose('extract');
      expect(result).toHaveLength(1);
    });

    it('applies date range filters', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.findByPurpose(
        'extract',
        new Date('2026-05-01'),
        new Date('2026-05-31'),
      );
      expect(result).toHaveLength(0);
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('findRecent', () => {
    it('returns recent audit entries with default limit', async () => {
      const result = await service.findRecent();
      expect(mockDb.limit).toHaveBeenCalledWith(50);
      expect(result).toHaveLength(2);
    });

    it('respects custom limit', async () => {
      await service.findRecent(10);
      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });
});
