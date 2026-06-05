import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { SignalExtractProcessor } from './extraction.processor';
import { ExtractorService } from './extractor.service';
import { JudgeService } from './judge.service';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DB } from '../db/db.module';
const validOutput = require('../../test/fixtures/extraction/valid-output.json');
const noTaskOutput = require('../../test/fixtures/extraction/no-task.json');

describe('SignalExtractProcessor', () => {
  let processor: SignalExtractProcessor;
  let mockExtractor: Partial<ExtractorService>;
  let mockJudge: Partial<JudgeService>;
  let mockTasksService: Partial<TasksService>;
  let mockNotifications: Partial<NotificationsService>;
  let mockDb: any;
  let selectResults: any[];

  const mockSignal = {
    id: 'sig-001',
    source: 'slack',
    subSource: 'slack_dm',
    externalId: 'C123:ts',
    dedupKey: 'slack:C123:ts',
    status: 'pending' as const,
    extractionAttempts: 0,
    lastError: null,
    createdAt: new Date(),
    processedAt: null,
    payload: {
      title: 'DM from John',
      body: 'Send the cap table by Friday',
      author: { name: 'John', email: 'john@test.com' },
      url: 'https://slack.com/archives/C123/p123',
      occurredAt: '2026-05-19T10:00:00Z',
      raw: {},
    },
  };

  beforeEach(async () => {
    mockExtractor = {
      extract: jest.fn().mockResolvedValue(validOutput),
    };
    mockJudge = {
      judge: jest.fn().mockResolvedValue({ verdict: 'KEEP', reason: 'Good task' }),
    };
    mockTasksService = {
      createFromExtraction: jest.fn().mockResolvedValue('task-001'),
    };
    mockNotifications = {
      sendPush: jest.fn().mockResolvedValue(undefined),
    };
    // The processor does multiple db calls in sequence:
    // 1. select().from(signals).where() → [signal]        (find signal)
    // 2. update(signals).set().where()  → void             (bump attempts)
    // 3. select().from(sourceConfig).where() → []          (load thresholds)
    // 4. update(signals).set().where()  → void             (mark extracted)
    selectResults = [
      [mockSignal],  // 1. find signal
      [],            // 3. loadThresholds (empty → falls back to defaults)
    ];

    mockDb = {
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalExtractProcessor,
        { provide: ExtractorService, useValue: mockExtractor },
        { provide: JudgeService, useValue: mockJudge },
        { provide: TasksService, useValue: mockTasksService },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    processor = module.get<SignalExtractProcessor>(SignalExtractProcessor);
  });

  it('processes a signal through the full pipeline', async () => {
    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockExtractor.extract).toHaveBeenCalled();
    expect(mockJudge.judge).toHaveBeenCalled();
    expect(mockTasksService.createFromExtraction).toHaveBeenCalled();
  });

  it('skips already processed signals', async () => {
    // Override: signal already extracted
    selectResults.length = 0;
    selectResults.push([{ ...mockSignal, status: 'extracted' }]);
    // Re-create mockDb with fresh selectResults reference
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? [])),
      }),
    });

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockExtractor.extract).not.toHaveBeenCalled();
  });

  it('skips a signal when its connector is paused', async () => {
    selectResults.length = 0;
    selectResults.push([mockSignal], [{ source: 'slack', enabled: false }]); // signal, then disabled connector cfg
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? [])),
      }),
    });

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockExtractor.extract).not.toHaveBeenCalled();
    expect(mockTasksService.createFromExtraction).not.toHaveBeenCalled();
  });

  it('skips signals not found in DB', async () => {
    selectResults.length = 0;
    selectResults.push([]);
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => Promise.resolve(selectResults.shift() ?? [])),
      }),
    });

    const job = { data: { signalId: 'nonexistent' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockExtractor.extract).not.toHaveBeenCalled();
  });

  it('marks signal as no_task when extraction returns noTask', async () => {
    (mockExtractor.extract as jest.Mock).mockResolvedValue(noTaskOutput);

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockJudge.judge).not.toHaveBeenCalled();
    expect(mockTasksService.createFromExtraction).not.toHaveBeenCalled();
  });

  it('routes DISMISS verdict to triage=dismissed (Filtered, not archived)', async () => {
    (mockJudge.judge as jest.Mock).mockResolvedValue({ verdict: 'DISMISS', reason: 'FYI' });

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    const createCall = (mockTasksService.createFromExtraction as jest.Mock).mock.calls[0][0];
    expect(createCall.triage).toBe('dismissed');
    expect(createCall.dismissed).toBeUndefined(); // no longer encoded as a user-archive
  });

  it('routes REVIEW verdict to triage=review', async () => {
    (mockJudge.judge as jest.Mock).mockResolvedValue({ verdict: 'REVIEW', reason: 'Ambiguous' });

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    const createCall = (mockTasksService.createFromExtraction as jest.Mock).mock.calls[0][0];
    expect(createCall.triage).toBe('review');
  });

  it('routes KEEP verdict with high confidence to triage=keep', async () => {
    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    const createCall = (mockTasksService.createFromExtraction as jest.Mock).mock.calls[0][0];
    expect(createCall.triage).toBe('keep');
    expect(createCall.autoCreated).toBe(true);
    // source provenance plumbed from the signal payload
    expect(createCall.sourceMeta).toEqual({ url: 'https://slack.com/archives/C123/p123', sentBy: { name: 'John', email: 'john@test.com' } });
  });

  it('synthesizes a fallback task for an explicit capture that the extractor returns noTask for', async () => {
    selectResults.length = 0;
    selectResults.push([{ ...mockSignal, subSource: 'slack_capture' }], []);
    (mockExtractor.extract as jest.Mock).mockResolvedValue(noTaskOutput);

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    // Explicit captures must never be dropped — a task is still created (judge bypassed → keep).
    expect(mockJudge.judge).not.toHaveBeenCalled();
    expect(mockTasksService.createFromExtraction).toHaveBeenCalled();
    const createCall = (mockTasksService.createFromExtraction as jest.Mock).mock.calls[0][0];
    expect(createCall.triage).toBe('keep');
    expect(createCall.autoCreated).toBe(true);
  });

  it('bypasses the judge for explicit Slack captures (@tctm / 🎯) and keeps them', async () => {
    selectResults.length = 0;
    selectResults.push([{ ...mockSignal, subSource: 'slack_capture' }], []);

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockJudge.judge).not.toHaveBeenCalled();
    const createCall = (mockTasksService.createFromExtraction as jest.Mock).mock.calls[0][0];
    expect(createCall.subSource).toBe('slack_capture');
    expect(createCall.triage).toBe('keep');
    expect(createCall.autoCreated).toBe(true);
    expect(createCall.judgeVerdict.verdict).toBe('KEEP');
  });

  it('treats a bare Gmail forward (gmail_capture) as an explicit capture', async () => {
    selectResults.length = 0;
    selectResults.push([{ ...mockSignal, source: 'gmail', subSource: 'gmail_capture' }], []);

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockJudge.judge).not.toHaveBeenCalled();
    const createCall = (mockTasksService.createFromExtraction as jest.Mock).mock.calls[0][0];
    expect(createCall.subSource).toBe('gmail_capture');
    expect(createCall.triage).toBe('keep');
    expect(createCall.autoCreated).toBe(true);
  });

  it('runs the judge for a noted Gmail forward (gmail_forward)', async () => {
    selectResults.length = 0;
    selectResults.push([{ ...mockSignal, source: 'gmail', subSource: 'gmail_forward' }], []);

    const job = { data: { signalId: 'sig-001' } } as Job<{ signalId: string }>;
    await processor.process(job);

    expect(mockJudge.judge).toHaveBeenCalled(); // not explicit — normal pipeline
  });
});
