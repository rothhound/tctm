import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: Partial<TasksService>;

  const mockPaginated = {
    data: [
      { id: 'task-1', title: 'Task 1', status: 'pending', bucket: 'inbox' },
      { id: 'task-2', title: 'Task 2', status: 'pending', bucket: 'inbox' },
    ],
    total: 2, page: 1, limit: 25, hasMore: false,
  };

  const mockArchivedList = [
    { id: 'task-3', title: 'Archived Task', status: 'done', bucket: 'inbox', archived: true },
  ];

  const mockReportedList = [
    { id: 'task-4', title: 'Reported Task', status: 'pending', bucket: 'inbox', reported: true },
  ];

  const mockSnoozedList = [
    { id: 'task-5', title: 'Snoozed Task', status: 'pending', bucket: 'inbox', reminderAt: '2099-01-01T00:00:00Z' },
  ];

  const mockSubtasks = [
    { id: 'sub-1', title: 'Subtask 1', parentTaskId: 'task-1' },
    { id: 'sub-2', title: 'Subtask 2', parentTaskId: 'task-1' },
  ];

  const mockNotes = [
    { id: 'note-1', taskId: 'task-1', content: 'A note' },
    { id: 'note-2', taskId: 'task-1', content: 'Another note' },
  ];

  const mockCreatedNote = { id: 'note-3', taskId: 'task-1', content: 'New note' };

  const mockCreatedSubtask = { id: 'sub-3', title: 'New subtask', parentTaskId: 'task-1' };

  beforeEach(async () => {
    tasksService = {
      listByBucket: jest.fn().mockResolvedValue(mockPaginated),
      getCounts: jest.fn().mockResolvedValue({ pending: 2, done: 0, total: 2 }),
      findOne: jest.fn().mockResolvedValue(mockPaginated.data[0]),
      edit: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      listArchived: jest.fn().mockResolvedValue(mockArchivedList),
      listReported: jest.fn().mockResolvedValue(mockReportedList),
      listSnoozed: jest.fn().mockResolvedValue(mockSnoozedList),
      getSubtasks: jest.fn().mockResolvedValue(mockSubtasks),
      archive: jest.fn().mockResolvedValue(undefined),
      unarchive: jest.fn().mockResolvedValue(undefined),
      report: jest.fn().mockResolvedValue(undefined),
      unreport: jest.fn().mockResolvedValue(undefined),
      setReminder: jest.fn().mockResolvedValue(undefined),
      clearReminder: jest.fn().mockResolvedValue(undefined),
      createSubtask: jest.fn().mockResolvedValue(mockCreatedSubtask),
      getTaskNotes: jest.fn().mockResolvedValue(mockNotes),
      createTaskNote: jest.fn().mockResolvedValue(mockCreatedNote),
      deleteTaskNote: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: tasksService }],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('lists tasks by bucket with pagination', async () => {
    const result = await controller.list('inbox', '1', '25');
    expect(tasksService.listByBucket).toHaveBeenCalledWith('inbox', 1, 25);
    expect(result).toEqual(mockPaginated);
  });

  it('defaults to inbox bucket, page 1, limit 25', async () => {
    await controller.list();
    expect(tasksService.listByBucket).toHaveBeenCalledWith('inbox', 1, 25);
  });

  it('returns badge counts', async () => {
    const result = await controller.counts();
    expect(result).toEqual({ pending: 2, done: 0, total: 2 });
  });

  it('returns single task by id', async () => {
    const result = await controller.findOne('task-1');
    expect(tasksService.findOne).toHaveBeenCalledWith('task-1');
    expect(result).toEqual(mockPaginated.data[0]);
  });

  it('completes a task', async () => {
    await controller.complete('task-1');
    expect(tasksService.complete).toHaveBeenCalledWith('task-1');
  });

  it('lists archived tasks', async () => {
    const result = await controller.archived();
    expect(tasksService.listArchived).toHaveBeenCalled();
    expect(result).toEqual(mockArchivedList);
  });

  it('lists reported tasks', async () => {
    const result = await controller.reported();
    expect(tasksService.listReported).toHaveBeenCalled();
    expect(result).toEqual(mockReportedList);
  });

  it('lists snoozed tasks', async () => {
    const result = await controller.snoozed();
    expect(tasksService.listSnoozed).toHaveBeenCalled();
    expect(result).toEqual(mockSnoozedList);
  });

  it('returns subtasks for a task', async () => {
    const result = await controller.subtasks('task-1');
    expect(tasksService.getSubtasks).toHaveBeenCalledWith('task-1');
    expect(result).toEqual(mockSubtasks);
  });

  it('edits a task, separating reason from updates', async () => {
    await controller.edit('task-1', { title: 'Updated Title', priority: 'high', reason: 'Correcting priority' });
    expect(tasksService.edit).toHaveBeenCalledWith(
      'task-1',
      { title: 'Updated Title', priority: 'high' },
      'Correcting priority',
    );
  });

  it('edits a task without a reason', async () => {
    await controller.edit('task-1', { title: 'New Title' });
    expect(tasksService.edit).toHaveBeenCalledWith('task-1', { title: 'New Title' }, undefined);
  });

  it('archives a task', async () => {
    await controller.archive('task-1');
    expect(tasksService.archive).toHaveBeenCalledWith('task-1');
  });

  it('unarchives a task', async () => {
    await controller.unarchive('task-1');
    expect(tasksService.unarchive).toHaveBeenCalledWith('task-1');
  });

  it('reports a task with a reason', async () => {
    await controller.report('task-1', { reason: 'Bad extraction' });
    expect(tasksService.report).toHaveBeenCalledWith('task-1', 'Bad extraction');
  });

  it('reports a task without a reason', async () => {
    await controller.report('task-1', {});
    expect(tasksService.report).toHaveBeenCalledWith('task-1', undefined);
  });

  it('unreports a task', async () => {
    await controller.unreport('task-1');
    expect(tasksService.unreport).toHaveBeenCalledWith('task-1');
  });

  it('sets a reminder on a task', async () => {
    await controller.setReminder('task-1', { reminderAt: '2026-06-01T09:00:00Z' });
    expect(tasksService.setReminder).toHaveBeenCalledWith('task-1', '2026-06-01T09:00:00Z');
  });

  it('clears a reminder from a task', async () => {
    await controller.clearReminder('task-1');
    expect(tasksService.clearReminder).toHaveBeenCalledWith('task-1');
  });

  it('creates a subtask', async () => {
    const body = { title: 'New subtask', priority: 'high' as const };
    const result = await controller.createSubtask('task-1', body);
    expect(tasksService.createSubtask).toHaveBeenCalledWith('task-1', body);
    expect(result).toEqual(mockCreatedSubtask);
  });

  it('returns notes for a task', async () => {
    const result = await controller.getTaskNotes('task-1');
    expect(tasksService.getTaskNotes).toHaveBeenCalledWith('task-1');
    expect(result).toEqual(mockNotes);
  });

  it('creates a note on a task', async () => {
    const result = await controller.createTaskNote('task-1', { content: 'New note' });
    expect(tasksService.createTaskNote).toHaveBeenCalledWith('task-1', 'New note');
    expect(result).toEqual(mockCreatedNote);
  });

  it('deletes a note by noteId', async () => {
    await controller.deleteTaskNote('note-1');
    expect(tasksService.deleteTaskNote).toHaveBeenCalledWith('note-1');
  });
});
