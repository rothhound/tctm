import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { GranolaService } from './granola.service';
import { DB } from '../../db/db.module';
import { QUEUES } from '../../shared/queues.module';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const noteSummary = {
  id: 'not_abc123',
  object: 'note',
  title: 'Board meeting',
  owner: { name: 'Jane', email: 'jane@firm.com' },
  created_at: '2026-05-19T10:00:00Z',
  updated_at: '2026-05-19T10:30:00Z',
};

function listResponse(notes: any[], hasMore = false, cursor: string | null = null) {
  return { ok: true, json: () => Promise.resolve({ notes, hasMore, cursor }) };
}
function noteResponse(detail: any) {
  return { ok: true, json: () => Promise.resolve(detail) };
}

describe('GranolaService', () => {
  let service: GranolaService;
  let mockDb: any;
  let mockQueue: any;

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
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, def?: any) =>
              k === 'GRANOLA_API_KEY' ? 'test-key' : k === 'GRANOLA_FOLDER_IDS' ? 'fld_default' : def ?? '',
          },
        },
      ],
    }).compile();

    service = module.get<GranolaService>(GranolaService);
    mockFetch.mockReset();
  });

  it('lists notes, fetches each summary, and creates one signal per note', async () => {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/notes/')
          ? noteResponse({ ...noteSummary, summary_text: 'Discussed Q2 hiring and budget.', web_url: 'https://notes.granola.ai/d/x' })
          : listResponse([noteSummary]),
      ),
    );

    await service.poll();

    // one note → list + get-note fetch → one signal → one extract enqueue
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);

    // verify the list call hit the real public API with the right params
    const listUrl = mockFetch.mock.calls[0][0] as string;
    expect(listUrl).toContain('public-api.granola.ai/v1/notes');
    expect(listUrl).toContain('updated_after=');
    expect(listUrl).toContain('page_size=30');
    expect(listUrl).toContain('folder_id=fld_default'); // always folder-scoped now
  });

  it('skips polling when no folder is configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GranolaService,
        { provide: DB, useValue: mockDb },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: mockQueue },
        { provide: ConfigService, useValue: { get: (k: string, def?: any) => (k === 'GRANOLA_API_KEY' ? 'test-key' : def ?? '') } },
      ],
    }).compile();

    const svc = module.get<GranolaService>(GranolaService);
    await svc.poll();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Builds a service scoped to the given comma-separated folder ids.
  async function makeScoped(folderIds: string): Promise<GranolaService> {
    const module = await Test.createTestingModule({
      providers: [
        GranolaService,
        { provide: DB, useValue: mockDb },
        { provide: getQueueToken(QUEUES.SIGNALS_EXTRACT), useValue: mockQueue },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, def?: any) =>
              k === 'GRANOLA_API_KEY' ? 'test-key' : k === 'GRANOLA_FOLDER_IDS' ? folderIds : def ?? '',
          },
        },
      ],
    }).compile();
    return module.get<GranolaService>(GranolaService);
  }

  it('polls each folder in a comma-separated GRANOLA_FOLDER_IDS and dedups notes', async () => {
    const scoped = await makeScoped('fld_a, fld_b');

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/notes/')) return Promise.resolve(noteResponse({ ...noteSummary, summary_text: 'summary' }));
      if (url.includes('folder_id=fld_a')) return Promise.resolve(listResponse([{ ...noteSummary, id: 'not_a' }]));
      if (url.includes('folder_id=fld_b')) return Promise.resolve(listResponse([{ ...noteSummary, id: 'not_b' }]));
      return Promise.resolve(listResponse([]));
    });

    await scoped.poll();

    const listUrls = mockFetch.mock.calls.map((c) => c[0] as string).filter((u) => !u.includes('/notes/'));
    expect(listUrls.some((u) => u.includes('folder_id=fld_a'))).toBe(true);
    expect(listUrls.some((u) => u.includes('folder_id=fld_b'))).toBe(true);
    expect(mockQueue.add).toHaveBeenCalledTimes(2); // two distinct notes, one per folder
  });

  it('skips a failing folder and still syncs the others', async () => {
    const scoped = await makeScoped('fld_bad, fld_good');

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/notes/')) return Promise.resolve(noteResponse({ ...noteSummary, summary_text: 'summary' }));
      if (url.includes('folder_id=fld_bad')) return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
      if (url.includes('folder_id=fld_good')) return Promise.resolve(listResponse([{ ...noteSummary, id: 'not_good' }]));
      return Promise.resolve(listResponse([]));
    });

    await scoped.poll(); // must not throw

    expect(mockQueue.add).toHaveBeenCalledTimes(1); // only the good folder's note ingested
  });

  it('skips a note that has no summary yet', async () => {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/notes/')
          ? noteResponse({ ...noteSummary, summary_text: '', summary_markdown: null })
          : listResponse([noteSummary]),
      ),
    );

    await service.poll();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('follows cursor pagination across pages', async () => {
    let listCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/notes/')) {
        return Promise.resolve(noteResponse({ ...noteSummary, summary_text: 'summary' }));
      }
      listCalls++;
      return Promise.resolve(
        listCalls === 1
          ? listResponse([{ ...noteSummary, id: 'not_page1' }], true, 'cursor-2')
          : listResponse([{ ...noteSummary, id: 'not_page2' }], false, null),
      );
    });

    await service.poll();

    expect(listCalls).toBe(2); // followed the cursor to page 2
    expect(mockQueue.add).toHaveBeenCalledTimes(2); // both notes ingested
    const carriedCursor = mockFetch.mock.calls.some((c) => (c[0] as string).includes('cursor=cursor-2'));
    expect(carriedCursor).toBe(true);
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
        { provide: ConfigService, useValue: { get: (_k: string, def?: any) => def ?? '' } },
      ],
    }).compile();

    const svc = module.get<GranolaService>(GranolaService);
    await svc.poll();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
