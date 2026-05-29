import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { DB } from '../db/db.module';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockDb: any;
  let queryResults: any[];

  /**
   * Build a chainable mock DB where each call to select() consumes
   * the next result from the queryResults queue. The chain supports:
   *   select().from().where().groupBy()  → returns result (with groupBy)
   *   select().from().where()            → returns result (without groupBy)
   */
  function createChainableMockDb(results: any[]) {
    queryResults = [...results];
    const db: any = {
      select: jest.fn().mockImplementation(() => {
        const result = queryResults.shift();
        const chain: any = {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              groupBy: jest.fn().mockResolvedValue(result),
              then: (resolve: any, reject: any) =>
                Promise.resolve(result).then(resolve, reject),
            }),
          }),
        };
        return chain;
      }),
    };
    return db;
  }

  beforeEach(async () => {
    // Default results for the 5 sequential queries:
    // 1. signalsBySource (select...from...where...groupBy)
    // 2. tasksByStatus   (select...from...where...groupBy)
    // 3. autoCreated     (select...from...where)
    // 4. total           (select...from...where)
    // 5. costResult      (select...from...where)
    mockDb = createChainableMockDb([
      [
        { source: 'slack', count: 15 },
        { source: 'gmail', count: 10 },
      ],
      [
        { status: 'pending', count: 8 },
        { status: 'done', count: 12 },
      ],
      [{ count: 5 }],
      [{ count: 20 }],
      [{ total: '0.4200' }],
    ]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: DB, useValue: mockDb }],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('returns correct structure with default 30 days', async () => {
    const result = await controller.daily();

    expect(result.period.days).toBe(30);
    expect(result.period.since).toBeDefined();
    expect(result.signalsBySource).toEqual({ slack: 15, gmail: 10 });
    expect(result.tasksByStatus).toEqual({ pending: 8, done: 12 });
    expect(result.autoCreateRatio).toBe(5 / 20);
    expect(result.totalLlmCostUsd).toBe(0.42);
    expect(mockDb.select).toHaveBeenCalledTimes(5);
  });

  it('parses custom days param', async () => {
    mockDb = createChainableMockDb([
      [{ source: 'notion', count: 3 }],
      [{ status: 'pending', count: 2 }],
      [{ count: 1 }],
      [{ count: 2 }],
      [{ total: '1.50' }],
    ]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: DB, useValue: mockDb }],
    }).compile();
    controller = module.get<MetricsController>(MetricsController);

    const before = Date.now();
    const result = await controller.daily('7');
    const after = Date.now();

    expect(result.period.days).toBe(7);

    // Verify the 'since' date is roughly 7 days ago
    const sinceMs = new Date(result.period.since).getTime();
    const expectedMs = 7 * 24 * 60 * 60 * 1000;
    expect(before - sinceMs).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(after - sinceMs).toBeLessThanOrEqual(expectedMs + 1000);

    expect(result.signalsBySource).toEqual({ notion: 3 });
    expect(result.autoCreateRatio).toBe(0.5);
    expect(result.totalLlmCostUsd).toBe(1.5);
  });

  it('handles zero total tasks (autoCreateRatio = 0)', async () => {
    mockDb = createChainableMockDb([
      [],
      [],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ total: '0' }],
    ]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: DB, useValue: mockDb }],
    }).compile();
    controller = module.get<MetricsController>(MetricsController);

    const result = await controller.daily();

    expect(result.signalsBySource).toEqual({});
    expect(result.tasksByStatus).toEqual({});
    expect(result.autoCreateRatio).toBe(0);
    expect(result.totalLlmCostUsd).toBe(0);
  });

  it('handles null cost result', async () => {
    mockDb = createChainableMockDb([
      [{ source: 'slack', count: 1 }],
      [{ status: 'pending', count: 1 }],
      [{ count: 1 }],
      [{ count: 1 }],
      [{ total: null }],
    ]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: DB, useValue: mockDb }],
    }).compile();
    controller = module.get<MetricsController>(MetricsController);

    const result = await controller.daily();

    expect(result.totalLlmCostUsd).toBe(0);
    expect(result.autoCreateRatio).toBe(1);
  });
});
