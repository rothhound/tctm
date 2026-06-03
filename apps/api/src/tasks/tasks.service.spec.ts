import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { DB } from '../db/db.module';
import { LlmService } from '../shared/llm/llm.service';
import type { ExtractedTask, JudgeVerdict } from '../extraction/types';

describe('TasksService', () => {
  let service: TasksService;
  let mockDb: any;

  const mockTask = {
    id: 'task-001',
    title: 'Send cap table',
    description: 'To Roelof',
    status: 'pending',
    bucket: 'inbox',
    triage: 'keep',
    priority: 'mid',
    archived: false,
    archivedAt: null,
    reported: false,
    reportedAt: null,
    reportReason: null,
    parentTaskId: null,
    recurrence: null,
    dueAt: null,
    reminderAt: null,
    entityIds: ['ent-001'],
    sourceSignalIds: ['sig-001'],
    waitingOnEntityIds: [],
    extraction: { sourceQuote: 'send cap table', confidence: 0.92, signals: {} },
    autoCreated: true,
    dedupHash: 'abc123',
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };

  const mockExtractedTask: ExtractedTask = {
    title: 'Send cap table',
    description: 'To Roelof',
    type: 'do',
    entityRefs: [{ mention: 'Roelof', entityId: 'ent-001' }],
    sourceQuote: 'send cap table',
    signals: { explicitness: 0.9, actionability: 0.9, addressedToUser: 0.9, entityMatchConfidence: 0.9, temporalClarity: 0.8 },
    overallConfidence: 0.9,
    ambiguityFlags: [],
  };

  const mockJudgeVerdict: JudgeVerdict = { verdict: 'KEEP', reason: 'Good task' };

  let queryResults: any[];

  function chainable() {
    const chain: any = {};

    // Build a thenable + chainable proxy for query results.
    // Defers resolution until a terminal method is called or the proxy is awaited.
    function terminal() {
      let resolve: (v: any) => void;
      let settled = false;
      const p = new Promise<any>((r) => { resolve = r; });
      const settle = () => { if (!settled) { settled = true; resolve(queryResults.shift() ?? []); } };

      const proxy: any = {
        limit: jest.fn().mockImplementation(() => { settle(); return proxy; }),
        offset: jest.fn().mockImplementation(() => proxy),
        orderBy: jest.fn().mockImplementation(() => { settle(); return proxy; }),
        then: (res: any, rej: any) => { settle(); return p.then(res, rej); },
      };
      return proxy;
    }

    for (const m of ['select', 'from', 'set'] as const) {
      chain[m] = jest.fn().mockReturnValue(chain);
    }

    chain.where = jest.fn().mockImplementation(() => terminal());
    chain.orderBy = jest.fn().mockImplementation(() => terminal());
    chain.limit = jest.fn().mockImplementation(() => terminal());
    chain.groupBy = jest.fn().mockImplementation(() => terminal());

    // insert chain
    chain.insert = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift() ?? [])),
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift() ?? [])),
        }),
        then: (res: any, rej: any) => Promise.resolve(queryResults.shift()).then(res, rej),
      }),
    });

    // update chain
    chain.update = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift())),
        returning: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift() ?? [])),
      }),
    });

    // delete chain
    chain.delete = jest.fn().mockReturnValue({
      where: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift())),
    });

    return chain;
  }

  beforeEach(async () => {
    queryResults = [];
    mockDb = chainable();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: DB, useValue: mockDb },
        {
          provide: LlmService,
          useValue: { modelFor: (p: string) => (p === 'extract' ? 'claude-opus-4-7' : 'claude-haiku-4-5-20251001') },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  // ── createFromExtraction ──────────────────────────────────────

  describe('createFromExtraction', () => {
    it('creates a new task when no dedup match exists', async () => {
      queryResults = [
        [],                          // dedup select → no match
        [{ id: 'task-001' }],        // insert...returning
      ];

      const id = await service.createFromExtraction({
        signalId: 'sig-001',
        subSource: 'slack_dm',
        task: mockExtractedTask,
        judgeVerdict: mockJudgeVerdict,
        triage: 'keep',
        autoCreated: true,
        dedupHash: 'abc123',
      });

      expect(id).toBe('task-001');
    });

    it('deduplicates to existing task within 7-day window', async () => {
      queryResults = [
        [{ id: 'existing-task', sourceSignalIds: ['sig-old'] }],
        undefined,
      ];

      const id = await service.createFromExtraction({
        signalId: 'sig-002',
        subSource: 'slack_dm',
        task: mockExtractedTask,
        judgeVerdict: mockJudgeVerdict,
        triage: 'keep',
        autoCreated: true,
        dedupHash: 'abc123',
      });

      expect(id).toBe('existing-task');
    });
  });

  // ── findOne ───────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns task when found', async () => {
      queryResults = [[mockTask]];
      const result = await service.findOne('task-001');
      expect(result.id).toBe('task-001');
    });

    it('throws NotFoundException when not found', async () => {
      queryResults = [[]];
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── listActive ────────────────────────────────────────────────

  describe('listActive', () => {
    it('returns paginated active tasks (keep + review, not dismissed)', async () => {
      queryResults = [
        [{ count: 3 }],                     // count query
        [mockTask, mockTask, mockTask],      // data query
      ];

      const result = await service.listActive(1, 25);
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('indicates hasMore when more pages exist', async () => {
      queryResults = [
        [{ count: 50 }],
        Array(25).fill(mockTask),
      ];

      const result = await service.listActive(1, 25);
      expect(result.hasMore).toBe(true);
    });

    it('uses default page and limit', async () => {
      queryResults = [[{ count: 0 }], []];
      const result = await service.listActive();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });
  });

  // ── listArchived ──────────────────────────────────────────────

  describe('listArchived', () => {
    it('returns archived tasks ordered by archivedAt desc', async () => {
      const archived = { ...mockTask, archived: true, archivedAt: new Date() };
      queryResults = [[archived]];

      const result = await service.listArchived();
      expect(result).toHaveLength(1);
      expect(result[0].archived).toBe(true);
    });
  });

  // ── listFiltered ──────────────────────────────────────────────

  describe('listFiltered', () => {
    it('returns agent-dismissed tasks', async () => {
      const dismissed = { ...mockTask, triage: 'dismissed' };
      queryResults = [[dismissed]];

      const result = await service.listFiltered();
      expect(result).toHaveLength(1);
      expect(result[0].triage).toBe('dismissed');
    });
  });

  // ── restore ───────────────────────────────────────────────────

  describe('restore', () => {
    it('promotes a filtered task to keep and records feedback', async () => {
      queryResults = [
        [{ ...mockTask, triage: 'dismissed' }], // select for existence
        undefined,                               // update
        [],                                      // insert feedback
      ];

      await service.restore('task-001');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ── listSnoozed ───────────────────────────────────────────────

  describe('listSnoozed', () => {
    it('returns snoozed tasks with future reminderAt', async () => {
      const snoozed = { ...mockTask, reminderAt: new Date(Date.now() + 86400000) };
      queryResults = [[snoozed]];

      const result = await service.listSnoozed();
      expect(result).toHaveLength(1);
    });
  });

  // ── listReported ──────────────────────────────────────────────

  describe('listReported', () => {
    it('returns reported tasks ordered by reportedAt desc', async () => {
      const reported = { ...mockTask, reported: true, reportedAt: new Date() };
      queryResults = [[reported]];

      const result = await service.listReported();
      expect(result).toHaveLength(1);
      expect(result[0].reported).toBe(true);
    });
  });

  // ── report / unreport ─────────────────────────────────────────

  describe('report', () => {
    it('marks task as reported and logs feedback', async () => {
      queryResults = [
        [mockTask],   // select for existence check
        undefined,    // update
        [],           // insert feedback
      ];

      await service.report('task-001', 'not_a_task');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('throws when task not found', async () => {
      queryResults = [[]];
      await expect(service.report('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('uses default reason when none given', async () => {
      queryResults = [[mockTask], undefined, []];
      await service.report('task-001');
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('unreport', () => {
    it('clears reported flag', async () => {
      queryResults = [undefined];
      await service.unreport('task-001');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ── getSubtasks ───────────────────────────────────────────────

  describe('getSubtasks', () => {
    it('returns subtasks for a parent task', async () => {
      const subtask = { ...mockTask, id: 'sub-001', parentTaskId: 'task-001' };
      queryResults = [[subtask]];

      const result = await service.getSubtasks('task-001');
      expect(result).toHaveLength(1);
      expect(result[0].parentTaskId).toBe('task-001');
    });

    it('returns empty array when no subtasks', async () => {
      queryResults = [[]];
      const result = await service.getSubtasks('task-001');
      expect(result).toHaveLength(0);
    });
  });

  // ── setReminder / clearReminder ───────────────────────────────

  describe('setReminder', () => {
    it('sets reminderAt on the task', async () => {
      queryResults = [[mockTask], undefined];
      await service.setReminder('task-001', '2026-06-01T09:00:00Z');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws when task not found', async () => {
      queryResults = [[]];
      await expect(service.setReminder('nonexistent', '2026-06-01T09:00:00Z')).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearReminder', () => {
    it('clears reminderAt on the task', async () => {
      queryResults = [undefined];
      await service.clearReminder('task-001');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ── getCounts ─────────────────────────────────────────────────

  describe('getCounts', () => {
    it('returns pending, done, total, and filtered counts', async () => {
      queryResults = [
        [{ count: 12 }], // pending
        [{ count: 4 }],  // filtered
        [{ count: 8 }],  // done
      ];

      const counts = await service.getCounts();
      expect(counts.pending).toBe(12);
      expect(counts.done).toBe(8);
      expect(counts.total).toBe(20);
      expect(counts.filtered).toBe(4);
    });

    it('handles zero counts', async () => {
      queryResults = [
        [{ count: 0 }],
        [{ count: 0 }],
        [{ count: 0 }],
      ];

      const counts = await service.getCounts();
      expect(counts.pending).toBe(0);
      expect(counts.done).toBe(0);
      expect(counts.total).toBe(0);
      expect(counts.filtered).toBe(0);
    });
  });

  // ── edit ──────────────────────────────────────────────────────

  describe('edit', () => {
    it('updates task fields and records feedback', async () => {
      queryResults = [
        [mockTask],   // findOne
        undefined,    // update
        [],           // insert feedback
      ];

      await service.edit('task-001', { title: 'Updated title' }, 'Corrected title');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('converts date strings to Date objects', async () => {
      queryResults = [[mockTask], undefined, []];

      await service.edit('task-001', { dueAt: '2026-06-15T12:00:00Z' });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('converts null dates correctly', async () => {
      queryResults = [[mockTask], undefined, []];

      await service.edit('task-001', { dueAt: null });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws when task not found', async () => {
      queryResults = [[]];
      await expect(service.edit('nonexistent', { title: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── complete ──────────────────────────────────────────────────

  describe('complete', () => {
    it('sets status to done', async () => {
      queryResults = [
        [mockTask],   // findOne
        undefined,    // update
      ];

      await service.complete('task-001');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws when task not found', async () => {
      queryResults = [[]];
      await expect(service.complete('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('checks parent completion when subtask is completed', async () => {
      const subtask = { ...mockTask, parentTaskId: 'parent-001' };
      queryResults = [
        [subtask],                              // findOne subtask
        undefined,                              // update subtask status
        [{ status: 'done' }, { status: 'done' }], // checkParentCompletion → siblings
        undefined,                              // update parent status
      ];

      await service.complete('task-001');
      // update called twice: once for subtask, once for parent auto-complete
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('does not auto-complete parent when siblings still pending', async () => {
      const subtask = { ...mockTask, parentTaskId: 'parent-001' };
      queryResults = [
        [subtask],
        undefined,
        [{ status: 'done' }, { status: 'pending' }],
      ];

      await service.complete('task-001');
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('creates next recurrence when task has recurrence', async () => {
      const recurring = {
        ...mockTask,
        recurrence: { pattern: 'weekly', interval: 1 },
        dueAt: new Date('2026-06-01'),
      };
      queryResults = [
        [recurring],           // findOne
        undefined,             // update status
        [{ id: 'next-001' }], // insert next recurrence
        [],                    // getSubtasks (no subtasks to clone)
      ];

      await service.complete('task-001');
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ── archive / unarchive ───────────────────────────────────────

  describe('archive', () => {
    it('sets archived flag', async () => {
      queryResults = [undefined];
      await service.archive('task-001');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('unarchive', () => {
    it('clears archived flag', async () => {
      queryResults = [undefined];
      await service.unarchive('task-001');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ── createSubtask ─────────────────────────────────────────────

  describe('createSubtask', () => {
    it('creates a subtask linked to parent', async () => {
      queryResults = [
        [mockTask],              // findOne parent
        [{ id: 'sub-001' }],    // insert...returning
      ];

      const id = await service.createSubtask('task-001', { title: 'Sub task' });
      expect(id).toBe('sub-001');
    });

    it('uses provided priority and dueAt', async () => {
      queryResults = [[mockTask], [{ id: 'sub-002' }]];

      const id = await service.createSubtask('task-001', {
        title: 'Urgent sub',
        priority: 'high',
        dueAt: '2026-06-15',
      });
      expect(id).toBe('sub-002');
    });

    it('throws when parent not found', async () => {
      queryResults = [[]];
      await expect(service.createSubtask('nonexistent', { title: 'Sub' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── Notes ─────────────────────────────────────────────────────

  describe('getTaskNotes', () => {
    it('returns notes for a task', async () => {
      const note = { id: 'note-001', taskId: 'task-001', content: '<p>Hello</p>', createdAt: new Date() };
      queryResults = [[note]];

      const result = await service.getTaskNotes('task-001');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('<p>Hello</p>');
    });

    it('returns empty array when no notes', async () => {
      queryResults = [[]];
      const result = await service.getTaskNotes('task-001');
      expect(result).toHaveLength(0);
    });
  });

  describe('createTaskNote', () => {
    it('creates a note and touches task updatedAt', async () => {
      const note = { id: 'note-001', taskId: 'task-001', content: 'Test', createdAt: new Date() };
      queryResults = [
        [mockTask],    // findOne
        [note],        // insert...returning
        undefined,     // update task updatedAt
      ];

      const result = await service.createTaskNote('task-001', 'Test');
      expect(result.id).toBe('note-001');
    });

    it('throws when task not found', async () => {
      queryResults = [[]];
      await expect(service.createTaskNote('nonexistent', 'Test')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTaskNote', () => {
    it('deletes the note', async () => {
      const note = { id: 'note-001', taskId: 'task-001', content: 'Test', createdAt: new Date() };
      queryResults = [
        [note],       // select note
        undefined,    // delete
      ];

      await service.deleteTaskNote('note-001');
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('throws when note not found', async () => {
      queryResults = [[]];
      await expect(service.deleteTaskNote('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
