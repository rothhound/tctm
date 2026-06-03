import { useCallback, useEffect, useState } from 'react';
import type { TaskDto } from '@tctm/shared';
import {
  useGetTaskQuery,
  useGetSubtasksQuery,
  useCreateSubtaskMutation,
  useCompleteTaskMutation,
  useArchiveTaskMutation,
  useUnarchiveTaskMutation,
  useUpdateTaskMutation,
  useSetReminderMutation,
  useClearReminderMutation,
  useReportTaskMutation,
  useUnreportTaskMutation,
} from '../../store/api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';
import { useTaskPanelKeyboard } from '../../hooks/useTaskPanelKeyboard';
import { LoadingSpinner } from './LoadingSpinner';
import { SourceIcon } from './SourceIcon';
import { RichTextEditor } from './RichTextEditor';
import { IconChevronDown, IconClose, IconCalendar, IconRecurrence, IconUndo } from './icons/task-panel-icons';
import {
  getPanelMode,
  toNoonISO,
  formatRecurrence,
  SnoozedBanner,
  ArchivedBanner,
  ReportedHero,
  AgentScores,
  PrioritySelector,
  DueDateChip,
  ReminderPicker,
  ReportDropdown,
  SubtaskList,
  NotesList,
  ActionChip,
  PanelFooter,
  HoverTip,
} from './task-panel';

interface TaskPanelProps {
  taskId: string;
  onClose: () => void;
  onTaskUpdated?: (taskId: string, updates: Record<string, any>) => void;
}

export function TaskPanel({ taskId, onClose, onTaskUpdated }: TaskPanelProps) {
  const { data: task, isLoading } = useGetTaskQuery(taskId);
  const { data: subtasks } = useGetSubtasksQuery(taskId);

  const [completeTask] = useCompleteTaskMutation();
  const [archiveTask] = useArchiveTaskMutation();
  const [unarchiveTask] = useUnarchiveTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [setReminder] = useSetReminderMutation();
  const [clearReminder] = useClearReminderMutation();
  const [reportTask] = useReportTaskMutation();
  const [unreportTask] = useUnreportTaskMutation();
  const [createSubtask] = useCreateSubtaskMutation();

  // Editable field drafts
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  // Counter props — incremented to trigger child component actions
  const [subtaskFocusTrigger, setSubtaskFocusTrigger] = useState(0);
  const [reminderOpenTrigger, setReminderOpenTrigger] = useState(0);
  const [showScores, setShowScores] = useState(false);

  // Sync drafts when task loads
  useEffect(() => {
    if (task) {
      setTitleDraft(task.title);
      setDescDraft(task.description ?? '');
    }
  }, [task]);

  // Hooks
  useBodyScrollLock();
  const { dragY, onTouchStart, onTouchMove, onTouchEnd } = useSwipeDismiss({ onDismiss: onClose });

  const handleArchive = useCallback(() => { if (task) { archiveTask(task.id); onClose(); } }, [task, archiveTask, onClose]);
  const handleComplete = useCallback(() => { if (task) { completeTask(task.id); onClose(); } }, [task, completeTask, onClose]);
  const handleNewSubtask = useCallback(() => setSubtaskFocusTrigger((c) => c + 1), []);

  useTaskPanelKeyboard({
    onClose,
    task,
    onArchive: handleArchive,
    onComplete: handleComplete,
    onNewSubtask: handleNewSubtask,
  });

  // Loading / empty state
  if (!task) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/20 md:bg-black/10 animate-[fadeIn_200ms_ease-out]" onClick={onClose} />
        <div className="fixed inset-0 z-50 md:inset-y-0 md:left-auto md:right-0 md:w-[480px] bg-[var(--color-surface)] shadow-xl flex flex-col animate-[slideUp_250ms_ease-out] md:animate-[slideLeft_250ms_ease-out]">
          {isLoading && <LoadingSpinner />}
        </div>
      </>
    );
  }

  const mode = getPanelMode(task);
  const isArchived = mode === 'archived';
  const isReported = mode === 'reported';
  const isSnoozed = mode === 'snoozed';
  const textCls = isArchived ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]';

  // Save handlers
  const saveTitle = () => {
    setEditingTitle(false);
    if (titleDraft !== task.title) {
      updateTask({ id: task.id, title: titleDraft });
      onTaskUpdated?.(task.id, { title: titleDraft });
    }
  };

  const saveDescription = () => {
    setEditingDescription(false);
    if (descDraft !== (task.description ?? '')) {
      updateTask({ id: task.id, description: descDraft || null });
      onTaskUpdated?.(task.id, { description: descDraft || null });
    }
  };

  const setDueDate = (date: string | null) => {
    const iso = date ? toNoonISO(date) : null;
    if (iso !== task.dueAt) {
      updateTask({ id: task.id, dueAt: iso });
      onTaskUpdated?.(task.id, { dueAt: iso });
    }
  };

  const setPriority = (p: string) => {
    if (p !== task.priority) {
      updateTask({ id: task.id, priority: p });
      onTaskUpdated?.(task.id, { priority: p });
    }
  };

  const handleSnooze = (date: string) => setReminder({ id: task.id, reminderAt: toNoonISO(date) });
  const handleWakeNow = () => clearReminder(task.id);
  const handleReport = (reason: string) => reportTask({ id: task.id, reason });

  const dueDateValue = task.dueAt ? task.dueAt.slice(0, 10) : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 md:bg-black/10 animate-[fadeIn_200ms_ease-out]" onClick={onClose} />

      <div
        className="fixed inset-0 z-50 md:inset-y-0 md:left-auto md:right-0 md:w-[480px] bg-[var(--color-surface)] shadow-xl flex flex-col animate-[slideUp_250ms_ease-out] md:animate-[slideLeft_250ms_ease-out]"
        style={{ transform: dragY > 0 ? `translateY(${dragY}px)` : undefined, transition: dragY === 0 ? 'transform 200ms ease' : 'none' }}
      >
        {/* ─── Header ─── */}
        <div
          className="px-4 md:px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <button onClick={onClose} className="md:hidden shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] active:scale-[0.97] transition-all" aria-label="Close">
            <IconChevronDown size={20} />
          </button>
          <div className="shrink-0 hidden md:flex">
            {task.source && <SourceIcon source={task.source} size={22} />}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {task.source && <span className="md:hidden inline-flex shrink-0"><SourceIcon source={task.source} size={20} /></span>}
            {/* Source provenance — to the right of the icon. Link for slack/granola/notion; sender email for gmail. */}
            {task.sourceMeta && (task.source === 'gmail' ? task.sourceMeta.sentBy?.email : task.sourceMeta.url) && (
              <span className="text-xs text-[var(--color-text-muted)] truncate">
                {task.source === 'gmail' ? (
                  <>Sent by {task.sourceMeta.sentBy?.email}</>
                ) : (
                  <a
                    href={task.sourceMeta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--color-text)] hover:underline underline-offset-2"
                  >
                    View in {task.source ? task.source.charAt(0).toUpperCase() + task.source.slice(1) : 'source'} ↗
                  </a>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ReminderPicker task={task} onSnooze={handleSnooze} onClearReminder={handleWakeNow} openTrigger={reminderOpenTrigger} />
            <ReportDropdown task={task} isReported={isReported} isArchived={isArchived} onReport={handleReport} onUnreport={() => unreportTask(task.id)} />
            <HoverTip label="Close panel (Esc)">
              <button onClick={onClose} className="hidden md:flex shrink-0 w-9 h-9 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] transition-colors" aria-label="Close">
                <IconClose size={20} />
              </button>
            </HoverTip>
          </div>
        </div>

        {/* ─── Scrollable content ─── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-5 py-4 space-y-4">
          {/* Banners */}
          {isSnoozed && task.reminderAt && <SnoozedBanner wakeAt={task.reminderAt} onWakeNow={handleWakeNow} />}
          {isArchived && task.archivedAt && <ArchivedBanner archivedAt={task.archivedAt} />}
          {isReported && task.extraction && (
            <ReportedHero extraction={task.extraction} reportReason={task.reportReason} signalCount={task.sourceSignalIds?.length ?? 0} />
          )}

          {/* Title */}
          <div>
            {editingTitle && !isArchived ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); } }}
                className={`w-full text-lg font-semibold bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1 focus:outline-none focus:border-[var(--color-primary)] ${textCls}`}
              />
            ) : (
              <h2
                onClick={() => !isArchived && setEditingTitle(true)}
                className={`text-lg font-semibold leading-snug ${isArchived ? '' : 'cursor-text'} rounded px-1 -mx-1 py-0.5 transition-colors ${textCls}`}
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Agent scores — revealed on click for any task (reported tasks already show the hero) */}
          {task.extraction && !isReported && (
            <div>
              <button
                onClick={() => setShowScores((s) => !s)}
                className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                aria-expanded={showScores}
              >
                <span className={`transition-transform ${showScores ? 'rotate-180' : ''}`}><IconChevronDown size={14} /></span>
                Agent scores
              </button>
              {showScores && <AgentScores extraction={task.extraction} signalCount={task.sourceSignalIds?.length ?? 0} />}
            </div>
          )}

          {/* Priority + Due date */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <PrioritySelector current={task.priority} onChange={setPriority} readonly={isArchived} muted={isArchived} />
            </div>
            <DueDateChip value={dueDateValue} onChange={setDueDate} muted={isArchived} />
          </div>

          {/* Description */}
          {(task.description || !isArchived) && (
            <div>
              {editingDescription && !isArchived ? (
                <RichTextEditor autoFocus value={descDraft} onChange={setDescDraft} onBlur={saveDescription} placeholder="Add a description..." minRows={3} />
              ) : (
                <div
                  onClick={() => !isArchived && setEditingDescription(true)}
                  className={`text-sm leading-relaxed ${isArchived ? '' : 'cursor-text'} rounded px-1 -mx-1 py-1 transition-colors min-h-[2rem] whitespace-pre-wrap break-words [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-0.5 [&_p]:mb-2 ${textCls}`}
                >
                  {task.description ? (
                    <div dangerouslySetInnerHTML={{ __html: task.description }} />
                  ) : (
                    <span className="text-[var(--color-text-muted)] italic">Add a description...</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Subtasks */}
          <SubtaskList
            taskId={task.id}
            subtasks={subtasks}
            isArchived={isArchived}
            onComplete={(id) => completeTask(id)}
            onCreate={(parentId, title) => createSubtask({ parentId, title })}
            focusTrigger={subtaskFocusTrigger}
          />

          {/* Notes */}
          <NotesList taskId={task.id} isArchived={isArchived} />

          {/* Quick actions */}
          {!isArchived && (isReported || isSnoozed || task.recurrence) && (
            <div>
              <div className="flex items-center gap-2">
                {isReported ? (
                  <ActionChip icon={<IconUndo size={16} />} label="Unreport" highlighted onClick={() => unreportTask(task.id)} />
                ) : isSnoozed ? (
                  <ActionChip icon={<IconCalendar size={16} />} label="Reschedule" onClick={() => setReminderOpenTrigger((c) => c + 1)} />
                ) : task.recurrence ? (
                  <ActionChip icon={<IconRecurrence size={16} />} label={formatRecurrence(task.recurrence)} />
                ) : null}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
            <span>Created {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            {task.completedAt && (
              <span>Completed {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            )}
          </div>
        </div>

        {/* ─── Footer ─── */}
        <PanelFooter
          task={task}
          mode={mode}
          onArchive={() => archiveTask(task.id)}
          onUnarchive={() => unarchiveTask(task.id)}
          onComplete={() => completeTask(task.id)}
          onClose={onClose}
        />
      </div>
    </>
  );
}
