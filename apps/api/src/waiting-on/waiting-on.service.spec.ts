import { Test, TestingModule } from '@nestjs/testing';
import { WaitingOnService } from './waiting-on.service';
import { EntitiesService } from '../entities/entities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ANTHROPIC } from '../shared/anthropic.module';
import { DB } from '../db/db.module';

describe('WaitingOnService', () => {
  let service: WaitingOnService;
  let mockAnthropicCreate: jest.Mock;
  let mockNotifications: Partial<NotificationsService>;
  let mockEntities: Partial<EntitiesService>;
  let selectResults: any[];

  const mockSignal = {
    id: 'sig-001',
    source: 'gmail',
    payload: {
      body: 'Here is the quarterly report as requested.',
      author: { name: 'CFO', email: 'cfo@portfolio.co' },
      occurredAt: '2026-05-19T10:00:00Z',
      raw: {},
      title: 'Re: Q2 Report',
    },
  };

  const mockWaitingTask = {
    id: 'task-001',
    title: 'Waiting for Q2 report from CFO',
    description: 'Expected by end of week',
    status: 'waiting_on',
    waitingOnEntityIds: ['ent-cfo-001'],
    extraction: {},
    autoCreated: true,
  };

  beforeEach(async () => {
    mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"resolves": true, "reason": "CFO sent the report"}' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    mockNotifications = {
      sendPush: jest.fn().mockResolvedValue(undefined),
    };

    mockEntities = {
      resolveByEmail: jest.fn().mockResolvedValue({ id: 'ent-cfo-001', canonicalName: 'CFO' }),
    };

    selectResults = [];

    const mockDb: any = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? [])),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitingOnService,
        { provide: ANTHROPIC, useValue: { messages: { create: mockAnthropicCreate } } },
        { provide: DB, useValue: mockDb },
        { provide: EntitiesService, useValue: mockEntities },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<WaitingOnService>(WaitingOnService);
  });

  it('auto-resolves a waiting_on task when entity responds', async () => {
    selectResults = [
      [mockSignal],          // load signal
      [mockWaitingTask],     // find waiting tasks
      [mockWaitingTask],     // load task for auto-resolve
    ];

    await service.checkResolution('sig-001');

    expect(mockAnthropicCreate).toHaveBeenCalled();
    expect(mockNotifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Task resolved' }),
    );
  });

  it('does nothing when signal author has no entity', async () => {
    (mockEntities.resolveByEmail as jest.Mock).mockResolvedValue(undefined);
    selectResults = [
      [{ ...mockSignal, payload: { ...mockSignal.payload, author: { email: 'unknown@test.com' } } }],
    ];

    await service.checkResolution('sig-001');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('does nothing when no waiting_on tasks match the entity', async () => {
    selectResults = [
      [mockSignal],  // load signal
      [],            // no waiting tasks
    ];

    await service.checkResolution('sig-001');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('does not auto-resolve when Haiku says no', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"resolves": false, "reason": "Unrelated message"}' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    selectResults = [
      [mockSignal],
      [mockWaitingTask],
    ];

    await service.checkResolution('sig-001');
    expect(mockNotifications.sendPush).not.toHaveBeenCalled();
  });

  it('fails safe when Haiku returns invalid response', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    selectResults = [
      [mockSignal],
      [mockWaitingTask],
    ];

    await service.checkResolution('sig-001');
    expect(mockNotifications.sendPush).not.toHaveBeenCalled();
  });
});
