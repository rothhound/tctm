import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { GranolaService } from './granola.service';
import { DB } from '../../db/db.module';
import { QUEUES } from '../../shared/queues.module';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('GranolaService', () => {
  let service: GranolaService;
  let mockDb: any;
  let mockQueue: any;

  const mockNote = {
    id: 'note-001',
    title: 'Board meeting',
    created_at: '2026-05-19T10:00:00Z',
    action_items: [
      { id: 'ai-1', text: 'Send updated financials to board', assignee: 'Jane', completed: false },
      { id: 'ai-2', text: 'Follow up on hiring plan', completed: false },
      { id: 'ai-3', text: 'Already done item', completed: true },
    ],
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: 'singleton', lastPolledAt: new Date(), lastSeenNoteId: null }]),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'sig-001' }]),
          }),
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    mockQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GranolaService,
        { provide: DB, useValue: mockDb },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: mockQueue },
        { provide: ConfigService, useValue: { get: (k: string) => k === 'GRANOLA_API_KEY' ? 'test-key' : '' } },
      ],
    }).compile();

    service = module.get<GranolaService>(GranolaService);
    mockFetch.mockClear();
  });

  it('fetches notes and creates signals for uncompleted action items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [mockNote] }),
    });

    await service.poll();

    // 2 uncompleted action items → 2 signals inserted → 2 queue adds
    // (the completed item ai-3 is filtered out)
    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  it('skips notes with no action items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [{ id: 'note-002', title: 'No items', created_at: '2026-05-19T11:00:00Z', action_items: [] }] }),
    });

    await service.poll();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

    // Should not throw
    await service.poll();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('skips polling when API key not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GranolaService,
        { provide: DB, useValue: mockDb },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: mockQueue },
        { provide: ConfigService, useValue: { get: () => '' } },
      ],
    }).compile();

    const svc = module.get<GranolaService>(GranolaService);
    await svc.poll();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
