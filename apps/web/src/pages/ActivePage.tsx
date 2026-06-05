import { useState, useCallback, useRef, useEffect } from 'react';
import type { TaskDto, TaskPriority } from '@tctm/shared';
import { useUpdateTaskMutation, useCompleteTaskMutation } from '../store/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { TaskCard } from '../components/ui/TaskCard';
import { TaskPanel } from '../components/ui/TaskPanel';
import { ViewToggle, useViewMode } from '../components/ui/ViewToggle';
import { EmptyState } from '../components/ui/EmptyState';
import { useAllTasks } from '../hooks/useAllTasks';
import { useNewSince } from '../hooks/useNewSince';
import { useBucketBadges } from '../hooks/useBucketBadges';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useTaskRoute } from '../hooks/useTaskRoute';

const PRIORITY_COLUMNS: { key: TaskPriority; label: string; dot: string }[] = [
  { key: 'high', label: 'High', dot: '#E24B4A' },
  { key: 'mid', label: 'Mid', dot: '#EF9F27' },
  { key: 'low', label: 'Low', dot: '#97C459' },
  { key: 'none', label: 'None', dot: '#d5d0c8' },
];

// Which priority column to open first on mobile: the busiest one, weighted by priority
// (count × weight). So a full High column wins, but a heavily-loaded Mid beats a near-empty High,
// and an empty High never shows first. Falls back to High (0) when there's nothing.
const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 4, mid: 3, low: 2, none: 1 };
function bestColumnIndex(groups: Record<TaskPriority, TaskDto[]>): number {
  let best = 0;
  let bestScore = -1;
  PRIORITY_COLUMNS.forEach((col, i) => {
    const score = (groups[col.key]?.length ?? 0) * PRIORITY_WEIGHT[col.key];
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function sortByCreated(tasks: TaskDto[]): TaskDto[] {
  return [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function sortByPriority(tasks: TaskDto[]): TaskDto[] {
  const order: Record<string, number> = { high: 0, mid: 1, low: 2, none: 3 };
  return [...tasks].sort((a, b) => {
    const pa = order[a.priority] ?? 3;
    const pb = order[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function groupByPriority(tasks: TaskDto[]): Record<TaskPriority, TaskDto[]> {
  const groups: Record<TaskPriority, TaskDto[]> = { high: [], mid: [], low: [], none: [] };
  for (const t of tasks) {
    const key = (groups[t.priority as TaskPriority] ? t.priority : 'none') as TaskPriority;
    groups[key].push(t);
  }
  for (const k of Object.keys(groups) as TaskPriority[]) groups[k] = sortByCreated(groups[k]);
  return groups;
}

// ── Drop zone with drag-over highlight ────────────────────────
function DropZone({ onDrop, children, className }: { onDrop: (taskId: string) => void; children: React.ReactNode; className?: string }) {
  const [dragOver, setDragOver] = useState(false);
  const counter = useRef(0);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDragEnter={(e) => { e.preventDefault(); counter.current++; if (counter.current === 1) setDragOver(true); }}
      onDragLeave={() => { counter.current--; if (counter.current === 0) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        counter.current = 0;
        setDragOver(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) onDrop(taskId);
      }}
      className={`transition-all rounded-lg ${dragOver ? 'ring-2 ring-[#1D9E75]/40 bg-[#E6F4DC]/30' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

// ── Single priority column ────────────────────────────────────
function PriorityColumn({ priority, label, dot, tasks, newTaskIds, onSelect, selectedTaskId, onDueDateChange, onCheckboxComplete, onChangePriority }: {
  priority: TaskPriority;
  label: string;
  dot: string;
  tasks: TaskDto[];
  newTaskIds: Set<string>;
  onSelect: (t: TaskDto) => void;
  selectedTaskId?: string | null;
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;
  onCheckboxComplete?: (taskId: string) => void;
  onChangePriority: (taskId: string, priority: TaskPriority) => void;
}) {
  return (
    <DropZone onDrop={(taskId) => onChangePriority(taskId, priority)} className="flex flex-col min-w-[280px] md:min-w-0 snap-start min-h-0">
      <div className="flex items-center gap-2 px-2 py-2 mb-2 shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{label}</h3>
        <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-alt)] px-1.5 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 px-1">
        {tasks.length === 0 && <p className="text-[11px] text-[var(--color-text-muted)] text-center py-8">Empty</p>}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} flavor="active" isNew={newTaskIds.has(t.id)} isSelected={t.id === selectedTaskId} onSelect={onSelect} onDueDateChange={onDueDateChange} onComplete={onCheckboxComplete} onChangePriority={onChangePriority} />
        ))}
      </div>
    </DropZone>
  );
}

// ── Mobile Kanban — one priority column at a time with arrow nav ────
function MobileKanbanView({ groups, newTaskIds, onSelect, selectedTaskId, onDueDateChange, onCheckboxComplete, onChangePriority }: {
  groups: Record<TaskPriority, TaskDto[]>;
  newTaskIds: Set<string>;
  onSelect: (t: TaskDto) => void;
  selectedTaskId?: string | null;
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;
  onCheckboxComplete?: (taskId: string) => void;
  onChangePriority: (taskId: string, priority: TaskPriority) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(() => bestColumnIndex(groups));
  const active = PRIORITY_COLUMNS[activeIdx];

  // Once tasks have loaded, open on the most relevant column — but only the first time, so the
  // user's manual column navigation (and the 30s background refetch) don't yank it back.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current) return;
    const total = PRIORITY_COLUMNS.reduce((n, c) => n + (groups[c.key]?.length ?? 0), 0);
    if (total > 0) {
      setActiveIdx(bestColumnIndex(groups));
      autoPicked.current = true;
    }
  }, [groups]);

  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 md:px-0">
      {/* Tab header — centered with arrows */}
      <div className="flex items-center justify-center gap-4 py-0 md:py-3 shrink-0">
        <button
          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            activeIdx > 0 ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]' : 'invisible'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8L10 13" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: active.dot }} />
          <span className="text-sm font-medium text-[var(--color-text)]">
            {active.label} ({groups[active.key].length})
          </span>
        </div>

        <button
          onClick={() => setActiveIdx((i) => Math.min(PRIORITY_COLUMNS.length - 1, i + 1))}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            activeIdx < PRIORITY_COLUMNS.length - 1 ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]' : 'invisible'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3L11 8L6 13" />
          </svg>
        </button>
      </div>

      {/* All columns rendered, only active one visible — preserves scroll state */}
      {PRIORITY_COLUMNS.map((col, idx) => (
        <div key={col.key} className={`flex-1 min-h-0 flex flex-col ${idx === activeIdx ? '' : 'hidden'}`}>
          <div className="overflow-y-auto flex-1 min-h-0 bg-[var(--color-surface-alt)] rounded-lg">
            {groups[col.key].length === 0 && <EmptyState message={`No ${col.label.toLowerCase()}-priority tasks.`} />}
            <div className="space-y-1.5">
              {groups[col.key].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  flavor="active"
                  isNew={newTaskIds.has(t.id)}
                  isSelected={t.id === selectedTaskId}
                  onSelect={onSelect}
                  onDueDateChange={onDueDateChange}
                  onComplete={onCheckboxComplete}
                  onChangePriority={onChangePriority}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Desktop List — flat sorted-by-priority list ───────────────
function DesktopListView({ pending, newTaskIds, hasMore, isLoadingMore, onLoadMore, onSelect, selectedTaskId, onDueDateChange, onCheckboxComplete, onChangePriority }: {
  pending: TaskDto[];
  newTaskIds: Set<string>;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (t: TaskDto) => void;
  selectedTaskId: string | null;
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;
  onCheckboxComplete: (taskId: string) => void;
  onChangePriority: (taskId: string, priority: TaskPriority) => void;
}) {
  const scrollRef = useInfiniteScroll(onLoadMore, hasMore, isLoadingMore);

  return (
    <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0 space-y-4 px-3 md:px-0">
      {pending.length > 0 && (
        <div>
          <div className="px-1 py-1.5 sticky top-0 bg-[var(--color-bg)] z-10">
            <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Pending ({pending.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {pending.map((t) => <TaskCard key={t.id} task={t} flavor="active" isNew={newTaskIds.has(t.id)} isSelected={t.id === selectedTaskId} onSelect={onSelect} onDueDateChange={onDueDateChange} onComplete={onCheckboxComplete} onChangePriority={onChangePriority} />)}
          </div>
        </div>
      )}

      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {pending.length === 0 && (
        <EmptyState message="You're all caught up. New tasks will appear as they're captured." />
      )}
    </div>
  );
}

// ── Kanban View (4 priority columns) ───────────────────────────
function KanbanView({ groups, newTaskIds, onSelect, selectedTaskId, onDueDateChange, onCheckboxComplete, onChangePriority }: {
  groups: Record<TaskPriority, TaskDto[]>;
  newTaskIds: Set<string>;
  onSelect: (t: TaskDto) => void;
  selectedTaskId?: string | null;
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;
  onCheckboxComplete: (taskId: string) => void;
  onChangePriority: (taskId: string, priority: TaskPriority) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:grid md:grid-cols-4 md:overflow-visible md:snap-none flex-1 min-h-0">
      {PRIORITY_COLUMNS.map((col) => (
        <PriorityColumn
          key={col.key}
          priority={col.key}
          label={col.label}
          dot={col.dot}
          tasks={groups[col.key]}
          newTaskIds={newTaskIds}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
          onDueDateChange={onDueDateChange}
          onCheckboxComplete={onCheckboxComplete}
          onChangePriority={onChangePriority}
        />
      ))}
    </div>
  );
}

// ── Active Page ────────────────────────────────────────────────
export function ActivePage() {
  usePageTitle('Active');
  const { selectedTaskId, openTask, closeTask } = useTaskRoute('/active');
  const [viewMode, setViewMode] = useViewMode();
  const [updateTask] = useUpdateTaskMutation();
  const [completeTask] = useCompleteTaskMutation();

  const { tasks: allTasks, isLoading, hasMore, loadMore, refetch, updateTaskLocally, removeTaskLocally } = useAllTasks();
  const { newTaskIds, newCount, markAllSeen } = useNewSince(allTasks);

  // The nav badge (getNewCounts) detects server-created tasks via its own focus/poll triggers, but
  // task creation invalidates no client cache. When the Active badge rises, pull the list so the
  // new tasks actually appear — keeping the board in lockstep with the badge.
  const badges = useBucketBadges();
  const prevActiveBadge = useRef(badges.active);
  useEffect(() => {
    if (badges.active > prevActiveBadge.current) refetch();
    prevActiveBadge.current = badges.active;
  }, [badges.active, refetch]);

  // Tab badge: prefix the title with the new-task count so it's visible from another tab.
  // Runs after usePageTitle's effect, so it owns the title once mounted.
  useEffect(() => {
    document.title = newCount > 0 ? `(${newCount}) TCTM | Active` : 'TCTM | Active';
  }, [newCount]);

  const pendingTasks = allTasks.filter((t) => t.status === 'pending');
  const pendingSorted = sortByPriority(pendingTasks);
  const grouped = groupByPriority(pendingTasks);

  const handleSelect = (task: TaskDto) => openTask(task.id);

  const handleDueDateChange = useCallback((taskId: string, dueAt: string | null) => {
    updateTask({ id: taskId, dueAt });
    updateTaskLocally(taskId, { dueAt });
  }, [updateTask, updateTaskLocally]);

  const handleCheckboxComplete = useCallback((taskId: string) => {
    removeTaskLocally(taskId);
    completeTask(taskId);
  }, [removeTaskLocally, completeTask]);

  const handleChangePriority = useCallback((taskId: string, priority: TaskPriority) => {
    updateTaskLocally(taskId, { priority });
    updateTask({ id: taskId, priority });
  }, [updateTask, updateTaskLocally]);

  // Kanban needs the width 4 columns can't get inside the shell's centered column
  // (AppShell main is lg:w-[90%] xl:w-[80%] 2xl:w-[70%], mx-auto). Reclaim the empty
  // side gutters for the board only — list + reading pages stay at their readable width.
  // Values undershoot the gutter (gutter/main-width per tier) so the board never overflows.
  const kanbanBreakout = viewMode === 'kanban' ? 'lg:-mx-[4%] xl:-mx-[10%] 2xl:-mx-[18%]' : '';

  return (
    <>
      <div className={`flex flex-col flex-1 min-h-0 min-w-0 ${kanbanBreakout}`}>
        <div className="flex items-center justify-between gap-3 mb-1 md:mb-4 px-4 md:px-0 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold text-[var(--color-text)]">Active</h1>
            {newCount > 0 && (
              <button
                onClick={markAllSeen}
                title="Mark all as seen"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:opacity-80 transition-opacity whitespace-nowrap"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                {newCount} new · Mark all seen
              </button>
            )}
          </div>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {isLoading && allTasks.length === 0 && <LoadingSpinner />}

        {!(isLoading && allTasks.length === 0) && viewMode === 'list' && (
          <DesktopListView
            pending={pendingSorted}
            newTaskIds={newTaskIds}
            hasMore={hasMore}
            isLoadingMore={isLoading}
            onLoadMore={loadMore}
            onSelect={handleSelect}
            selectedTaskId={selectedTaskId}
            onDueDateChange={handleDueDateChange}
            onCheckboxComplete={handleCheckboxComplete}
            onChangePriority={handleChangePriority}
          />
        )}

        {/* Kanban: mobile = one column at a time with arrows, desktop = side by side */}
        {!(isLoading && allTasks.length === 0) && viewMode === 'kanban' && (
          <>
            <div className="md:hidden flex-1 min-h-0 flex flex-col">
              <MobileKanbanView groups={grouped} newTaskIds={newTaskIds} onSelect={handleSelect} selectedTaskId={selectedTaskId} onDueDateChange={handleDueDateChange} onCheckboxComplete={handleCheckboxComplete} onChangePriority={handleChangePriority} />
            </div>
            <div className="hidden md:flex flex-1 min-h-0">
              <KanbanView groups={grouped} newTaskIds={newTaskIds} onSelect={handleSelect} selectedTaskId={selectedTaskId} onDueDateChange={handleDueDateChange} onCheckboxComplete={handleCheckboxComplete} onChangePriority={handleChangePriority} />
            </div>
          </>
        )}
      </div>

      {selectedTaskId && (
        <TaskPanel
          taskId={selectedTaskId}
          onClose={closeTask}
          onTaskUpdated={(id, updates) => updateTaskLocally(id, updates as any)}
        />
      )}
    </>
  );
}
