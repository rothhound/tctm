import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { IntegrationHealthService } from './integration-health.service';
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
        {
          provide: IntegrationHealthService,
          useValue: {
            checkAll: jest.fn().mockResolvedValue([
              { name: 'Anthropic', state: 'ok', detail: 'key set' },
              { name: 'Slack', state: 'ok', detail: 'connected' },
              { name: 'Notion', state: 'configured', detail: 'webhook token set' },
            ]),
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

  it('exposes only data-source connectors (excludes the LLM provider) with counts + pause state', async () => {
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          { source: 'slack', today: 2, all_time: 10 },
          { source: 'notion', today: 0, all_time: 3 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ source: 'slack', enabled: false }] });

    const result = await controller.integrations();
    expect(result.map((s) => s.name)).toEqual(['Slack', 'Notion']);

    const slack = result.find((s) => s.name === 'Slack')!;
    expect(slack.signalsToday).toBe(2);
    expect(slack.signalsAllTime).toBe(10);
    expect(slack.paused).toBe(true);
    expect(result.find((s) => s.name === 'Notion')!.paused).toBe(false);
  });
});
