import { Test, TestingModule } from '@nestjs/testing';
import { SourceConfigController } from './source-config.controller';
import { DB } from '../db/db.module';

describe('SourceConfigController', () => {
  let controller: SourceConfigController;
  let mockDb: any;
  let mockFrom: jest.Mock;
  let mockReturning: jest.Mock;
  let mockWhere: jest.Mock;
  let mockSet: jest.Mock;

  const mockConfigs = [
    { source: 'slack', enabled: true, thresholds: { confidence: 0.7 }, filters: {} },
    { source: 'gmail', enabled: true, thresholds: { confidence: 0.6 }, filters: {} },
  ];

  const updatedRow = {
    source: 'slack',
    enabled: false,
    thresholds: { confidence: 0.8 },
    filters: { exclude: ['spam'] },
    updatedAt: expect.any(Date),
  };

  beforeEach(async () => {
    mockFrom = jest.fn().mockResolvedValue(mockConfigs);
    mockReturning = jest.fn().mockResolvedValue([updatedRow]);
    mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
    mockSet = jest.fn().mockReturnValue({ where: mockWhere });

    mockDb = {
      select: jest.fn().mockReturnValue({ from: mockFrom }),
      update: jest.fn().mockReturnValue({ set: mockSet }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SourceConfigController],
      providers: [{ provide: DB, useValue: mockDb }],
    }).compile();

    controller = module.get<SourceConfigController>(SourceConfigController);
  });

  describe('list()', () => {
    it('returns all source configs', async () => {
      const result = await controller.list();
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalled();
      expect(result).toEqual(mockConfigs);
    });
  });

  describe('update()', () => {
    it('updates enabled flag', async () => {
      const result = await controller.update('slack', { enabled: false });
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false, updatedAt: expect.any(Date) }),
      );
      expect(result).toEqual(updatedRow);
    });

    it('updates thresholds', async () => {
      const thresholds = { confidence: 0.9 };
      await controller.update('gmail', { thresholds });
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ thresholds, updatedAt: expect.any(Date) }),
      );
    });

    it('updates filters', async () => {
      const filters = { exclude: ['marketing'] };
      await controller.update('slack', { filters });
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ filters, updatedAt: expect.any(Date) }),
      );
    });

    it('updates all fields at once', async () => {
      const body = {
        enabled: true,
        thresholds: { confidence: 0.5 },
        filters: { include: ['deals'] },
      };
      await controller.update('notion', body);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          thresholds: body.thresholds,
          filters: body.filters,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('does not include enabled when undefined', async () => {
      await controller.update('slack', { thresholds: { confidence: 0.7 } });
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg).not.toHaveProperty('enabled');
      expect(setArg).toHaveProperty('thresholds');
    });

    it('does not include thresholds when not provided', async () => {
      await controller.update('slack', { enabled: true });
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg).toHaveProperty('enabled', true);
      expect(setArg).not.toHaveProperty('thresholds');
    });

    it('does not include filters when not provided', async () => {
      await controller.update('slack', { enabled: false });
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg).not.toHaveProperty('filters');
    });

    it('always includes updatedAt', async () => {
      await controller.update('slack', {});
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg).toHaveProperty('updatedAt');
      expect(setArg.updatedAt).toBeInstanceOf(Date);
    });

    it('returns the updated row', async () => {
      const result = await controller.update('slack', { enabled: false });
      expect(result).toEqual(updatedRow);
    });
  });
});
