import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { DB } from '../db/db.module';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DB, useValue: mockDb },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: any) => def,
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns db status ok when database is reachable', async () => {
    const result = await controller.check();
    expect(result.db).toBe('ok');
  });

  it('returns db status error when database is unreachable', async () => {
    mockDb.execute.mockRejectedValue(new Error('Connection refused'));
    const result = await controller.check();
    expect(result.db).toBe('error');
  });
});
