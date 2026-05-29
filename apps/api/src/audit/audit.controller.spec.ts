import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: Partial<AuditService>;

  const mockAuditLogs = [
    { id: 'log-1', purpose: 'extract', signalId: 'sig-1', createdAt: new Date() },
    { id: 'log-2', purpose: 'judge', signalId: 'sig-2', createdAt: new Date() },
  ];

  beforeEach(async () => {
    auditService = {
      findBySignalId: jest.fn().mockResolvedValue([mockAuditLogs[0]]),
      findByPurpose: jest.fn().mockResolvedValue(mockAuditLogs),
      findRecent: jest.fn().mockResolvedValue(mockAuditLogs),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: auditService }],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('list() — signalId branch', () => {
    it('filters by signalId when provided', async () => {
      const result = await controller.list('sig-1');
      expect(auditService.findBySignalId).toHaveBeenCalledWith('sig-1');
      expect(result).toEqual([mockAuditLogs[0]]);
    });

    it('prefers signalId over purpose when both provided', async () => {
      await controller.list('sig-1', 'extract');
      expect(auditService.findBySignalId).toHaveBeenCalledWith('sig-1');
      expect(auditService.findByPurpose).not.toHaveBeenCalled();
    });
  });

  describe('list() — purpose branch', () => {
    it('filters by purpose when provided (no date range)', async () => {
      const result = await controller.list(undefined, 'extract');
      expect(auditService.findByPurpose).toHaveBeenCalledWith('extract', undefined, undefined);
      expect(result).toEqual(mockAuditLogs);
    });

    it('passes since date when provided', async () => {
      const since = '2026-05-01T00:00:00Z';
      await controller.list(undefined, 'judge', since);
      expect(auditService.findByPurpose).toHaveBeenCalledWith(
        'judge',
        new Date(since),
        undefined,
      );
    });

    it('passes until date when provided', async () => {
      const until = '2026-05-28T23:59:59Z';
      await controller.list(undefined, 'extract', undefined, until);
      expect(auditService.findByPurpose).toHaveBeenCalledWith(
        'extract',
        undefined,
        new Date(until),
      );
    });

    it('passes both since and until dates', async () => {
      const since = '2026-05-01T00:00:00Z';
      const until = '2026-05-28T23:59:59Z';
      await controller.list(undefined, 'judge', since, until);
      expect(auditService.findByPurpose).toHaveBeenCalledWith(
        'judge',
        new Date(since),
        new Date(until),
      );
    });
  });

  describe('list() — default (findRecent) branch', () => {
    it('returns recent logs with default limit of 50', async () => {
      const result = await controller.list();
      expect(auditService.findRecent).toHaveBeenCalledWith(50);
      expect(result).toEqual(mockAuditLogs);
    });

    it('parses custom limit string to integer', async () => {
      await controller.list(undefined, undefined, undefined, undefined, '100');
      expect(auditService.findRecent).toHaveBeenCalledWith(100);
    });

    it('uses default limit when limit is not provided', async () => {
      await controller.list(undefined, undefined, undefined, undefined, undefined);
      expect(auditService.findRecent).toHaveBeenCalledWith(50);
    });
  });
});
