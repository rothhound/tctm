import { useState, useCallback, useRef } from 'react';
import type { TaskDto } from '@tctm/shared';
import { useUpdateTaskMutation, useCompleteTaskMutation } from '../store/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { TaskRow } from '../components/ui/TaskRow';
import { TaskPanel } from '../components/ui/TaskPanel';
import { ViewToggle, useViewMode } from '../components/ui/ViewToggle';
import { EmptyState } from '../components/ui/EmptyState';
import { useAllTasks } from '../hooks/useAllTasks';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

function sortByPriority(tasks: TaskDto[]): TaskDto[] {
  const order: Record<string, number> = { high: 0, mid: 1, low: 2, none: 3 };
  return [...tasks].sort((a, b) => {
    const pa = order[a.priority] ?? 3;
    const pb = order[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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

// ── Single kanban column ───────────────────────────────────────
function KanbanColumn({ tasks, variant, onSelect, selectedTaskId, onDueDateChange, onCheckboxComplete, highlightedTaskId }: { tasks: TaskDto[]; variant: 'pending' | 'done'; onSelect: (t: TaskDto) => void; selectedTaskId?: string | null; onDueDateChange?: (taskId: string, dueAt: string | null) => void; onCheckboxComplete?: (taskId: string) => void; highlightedTaskId?: string | null }) {
  const isPending = variant === 'pending';
  return (
    <div className="overflow-y-auto flex-1 min-h-0 bg-[var(--color-surface-alt)] rounded-lg">
      {tasks.length === 0 && (
        <EmptyState message={isPending ? 'You\'re all caught up. No pending tasks.' : 'No completed tasks yet. They\'ll show up here.'} />
      )}
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            showCheckbox={isPending}
            isSelected={t.id === selectedTaskId}
            onSelect={onSelect}
            onDueDateChange={isPending ? onDueDateChange : undefined}
            onComplete={isPending ? onCheckboxComplete : undefined}
            highlighted={!isPending && t.id === highlightedTaskId}
          />
        ))}
      </div>
    </div>
  );
}

// ── Mobile Kanban — one column at a time with arrow nav ────────
function MobileKanbanView({ pending, done, onSelect, selectedTaskId, onDueDateChange, onCheckboxComplete, highlightedTaskId }: { pending: TaskDto[]; done: TaskDto[]; onSelect: (t: TaskDto) => void; selectedTaskId?: string | null; onDueDateChange?: (taskId: string, dueAt: string | null) => void; onCheckboxComplete?: (taskId: string) => void; highlightedTaskId?: string | null }) {
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');

  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 md:px-0">
      {/* Tab header — centered with arrows */}
      <div className="flex items-center justify-center gap-4 py-0 md:py-3 shrink-0">
        <button
          onClick={() => setActiveTab('pending')}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            activeTab === 'done' ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]' : 'invisible'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8L10 13" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${activeTab === 'pending' ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-success)]'}`} />
          <span className="text-sm font-medium text-[var(--color-text)]">
            {activeTab === 'pending' ? `Pending (${pending.length})` : `Done (${done.length})`}
          </span>
        </div>

        <button
          onClick={() => setActiveTab('done')}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            activeTab === 'pending' ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]' : 'invisible'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3L11 8L6 13" />
          </svg>
        </button>
      </div>

      {/* Both columns rendered, only active one visible — preserves scroll state */}
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'pending' ? '' : 'hidden'}`}>
        <KanbanColumn tasks={pending} variant="pending" onSelect={onSelect} selectedTaskId={selectedTaskId} onDueDateChange={onDueDateChange} onCheckboxComplete={onCheckboxComplete} />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'done' ? '' : 'hidden'}`}>
        <KanbanColumn tasks={done} variant="done" onSelect={onSelect} selectedTaskId={selectedTaskId} highlightedTaskId={highlightedTaskId} />
      </div>
    </div>
  );
}

// ── Desktop List — both sections in one scroll ─────────────────
function DesktopListView({ pending, done, hasMore, isLoadingMore, onLoadMore, onSelect, selectedTaskId, onDueDateChange, onComplete, onCheckboxComplete, highlightedTaskId }: {
  pending: TaskDto[];
  done: TaskDto[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (t: TaskDto) => void;
  selectedTaskId: string | null;
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;
  onComplete: (taskId: string) => void;
  onCheckboxComplete: (taskId: string) => void;
  highlightedTaskId: string | null;
}) {
  const [showDone, setShowDone] = useState(false);
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
            {pending.map((t) => <TaskRow key={t.id} task={t} isSelected={t.id === selectedTaskId} onSelect={onSelect} onDueDateChange={onDueDateChange} onComplete={onCheckboxComplete} />)}
          </div>
        </div>
      )}

      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {(pending.length > 0 || done.length > 0) && (
        <DropZone onDrop={onComplete}>
          <button
            onClick={() => setShowDone(!showDone)}
            className="px-1 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text)] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={`transition-transform ${showDone ? 'rotate-90' : ''}`}>
              <path d="M3 1L7 5L3 9" />
            </svg>
            Done ({done.length})
          </button>
          {showDone && done.length > 0 && (
            <div className="space-y-1.5">
              {done.map((t) => <TaskRow key={t.id} task={t} showCheckbox={false} isSelected={t.id === selectedTaskId} onSelect={onSelect} highlighted={t.id === highlightedTaskId} />)}
            </div>
          )}
        </DropZone>
      )}

      {pending.length === 0 && done.length === 0 && (
        <EmptyState message="You're all caught up. New tasks will appear as they're captured." />
      )}
    </div>
  );
}

// ── Kanban View (2 columns: Pending / Done) ────────────────────
function KanbanView({ pending, done, onSelect, selectedTaskId, onDueDateChange, onComplete, onCheckboxComplete, highlightedTaskId }: { pending: TaskDto[]; done: TaskDto[]; onSelect: (t: TaskDto) => void; selectedTaskId?: string | null; onDueDateChange?: (taskId: string, dueAt: string | null) => void; onComplete: (taskId: string) => void; onCheckboxComplete: (taskId: string) => void; highlightedTaskId: string | null }) {
  return (
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:grid md:grid-cols-2 md:overflow-visible md:snap-none flex-1 min-h-0">
      {/* Pending column */}
      <div className="flex flex-col min-w-[280px] md:min-w-0 snap-start min-h-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Pending</h3>
          <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-alt)] px-1.5 py-0.5 rounded-full">{pending.length}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 px-1">
          {pending.length === 0 && <p className="text-[11px] text-[var(--color-text-muted)] text-center py-8">All clear</p>}
          {pending.map((t) => (
            <TaskRow key={t.id} task={t} isSelected={t.id === selectedTaskId} onSelect={onSelect} onDueDateChange={onDueDateChange} onComplete={onCheckboxComplete} />
          ))}
        </div>
      </div>

      {/* Done column */}
      <DropZone onDrop={onComplete} className="flex flex-col min-w-[280px] md:min-w-0 snap-start min-h-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Done</h3>
          <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-alt)] px-1.5 py-0.5 rounded-full">{done.length}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 px-1">
          {done.length === 0 && <p className="text-[11px] text-[var(--color-text-muted)] text-center py-8">Nothing done yet</p>}
          {done.map((t) => (
            <TaskRow key={t.id} task={t} showCheckbox={false} isSelected={t.id === selectedTaskId} onSelect={onSelect} highlighted={t.id === highlightedTaskId} />
          ))}
        </div>
      </DropZone>
    </div>
  );
}

// ── Active Page ────────────────────────────────────────────────
export function ActivePage() {
  usePageTitle('Active');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useViewMode();
  const [updateTask] = useUpdateTaskMutation();
  const [completeTask] = useCompleteTaskMutation();

  const { tasks: allTasks, isLoading, hasMore, loadMore, updateTaskLocally } = useAllTasks();

  const pending = sortByPriority(allTasks.filter((t) => t.status === 'pending'));
  const done = allTasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime());

  const handleSelect = (task: TaskDto) => setSelectedTaskId(task.id);

  const handleDueDateChange = useCallback((taskId: string, dueAt: string | null) => {
    updateTask({ id: taskId, dueAt });
    updateTaskLocally(taskId, { dueAt });
  }, [updateTask, updateTaskLocally]);

  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  const handleComplete = useCallback((taskId: string) => {
    updateTaskLocally(taskId, { status: 'done' as const, completedAt: new Date().toISOString() });
    completeTask(taskId);
  }, [updateTaskLocally, completeTask]);

  const handleCheckboxComplete = useCallback((taskId: string) => {
    handleComplete(taskId);
    setHighlightedTaskId(taskId);
    setTimeout(() => setHighlightedTaskId(null), 1500);
  }, [handleComplete]);

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex items-center justify-between mb-1 md:mb-4 px-4 md:px-0 shrink-0">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Active</h1>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {isLoading && allTasks.length === 0 && <LoadingSpinner />}

        {!(isLoading && allTasks.length === 0) && viewMode === 'list' && (
          <DesktopListView
            pending={pending}
            done={done}
            hasMore={hasMore}
            isLoadingMore={isLoading}
            onLoadMore={loadMore}
            onSelect={handleSelect}
            selectedTaskId={selectedTaskId}
            onDueDateChange={handleDueDateChange}
            onComplete={handleComplete}
            onCheckboxComplete={handleCheckboxComplete}
            highlightedTaskId={highlightedTaskId}
          />
        )}

        {/* Kanban: mobile = one column at a time with arrows, desktop = side by side */}
        {!(isLoading && allTasks.length === 0) && viewMode === 'kanban' && (
          <>
            <div className="md:hidden flex-1 min-h-0 flex flex-col">
              <MobileKanbanView pending={pending} done={done} onSelect={handleSelect} selectedTaskId={selectedTaskId} onDueDateChange={handleDueDateChange} onCheckboxComplete={handleCheckboxComplete} highlightedTaskId={highlightedTaskId} />
            </div>
            <div className="hidden md:flex flex-1 min-h-0">
              <KanbanView pending={pending} done={done} onSelect={handleSelect} selectedTaskId={selectedTaskId} onDueDateChange={handleDueDateChange} onComplete={handleComplete} onCheckboxComplete={handleCheckboxComplete} highlightedTaskId={highlightedTaskId} />
            </div>
          </>
        )}
      </div>

      {selectedTaskId && (
        <TaskPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={(id, updates) => updateTaskLocally(id, updates as any)}
        />
      )}
    </>
  );
}
