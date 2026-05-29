import { useEffect, useRef, useState } from 'react';
import type { TaskDto } from '@tctm/shared';
import { IconPlus, IconCheckBig, IconGrip } from '../icons/task-panel-icons';
import { HoverTip } from './HoverTip';

export function SubtaskList({
  taskId, subtasks, isArchived, onComplete, onCreate, focusTrigger,
}: {
  taskId: string;
  subtasks: TaskDto[] | undefined;
  isArchived: boolean;
  onComplete: (id: string) => void;
  onCreate: (parentId: string, title: string) => void;
  focusTrigger: number;
}) {
  const [showInput, setShowInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const completedCount = subtasks?.filter((s) => s.status === 'done').length ?? 0;
  const totalCount = subtasks?.length ?? 0;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  // External focus trigger (from keyboard shortcut "N")
  useEffect(() => {
    if (focusTrigger > 0) {
      setShowInput(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [focusTrigger]);

  const headerLabel = totalCount > 0 ? `${completedCount} / ${totalCount} subtasks` : 'Subtasks';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-medium ${isArchived ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}>
          {headerLabel}
        </p>
        {!isArchived && (
          <HoverTip label="Add subtask (N)">
            <button
              onClick={() => { setShowInput(true); setTimeout(() => inputRef.current?.focus(), 0); }}
              className="w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] active:scale-[0.97] transition-all"
              aria-label="Add subtask"
            >
              <IconPlus size={18} />
            </button>
          </HoverTip>
        )}
      </div>

      {totalCount > 0 && (
        <div className="h-1 bg-[var(--color-surface-alt)] rounded-full overflow-hidden mb-2">
          <div className="h-full bg-[var(--color-success)] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {subtasks && subtasks.length > 0 && (
        <div className="space-y-0.5">
          {subtasks.map((sub) => {
            const done = sub.status === 'done';
            return (
              <div
                key={sub.id}
                className="group flex items-center gap-2.5 py-1.5 px-1.5 -mx-1.5 rounded-md md:hover:bg-[var(--color-surface-alt)] transition-colors"
              >
                <button
                  onClick={() => { if (!done && !isArchived) onComplete(sub.id); }}
                  disabled={isArchived}
                  className={`w-9 h-9 md:w-7 md:h-7 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                    done
                      ? 'bg-[var(--color-success)] border-[var(--color-success)] text-white'
                      : 'border-[var(--color-border)] text-transparent hover:border-[var(--color-success)] disabled:hover:border-[var(--color-border)] disabled:cursor-not-allowed'
                  }`}
                  aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {done && <IconCheckBig size={16} />}
                </button>
                <span className={`flex-1 min-w-0 text-sm ${
                  done ? 'line-through text-[var(--color-text-muted)]'
                    : isArchived ? 'text-[var(--color-text-muted)]'
                    : 'text-[var(--color-text)]'
                }`}>
                  {sub.title}
                </span>
                {!isArchived && (
                  <span className="shrink-0 text-[var(--color-text-muted)] cursor-grab opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" aria-hidden>
                    <IconGrip size={18} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showInput && !isArchived && (
        <div className="mt-2 flex gap-2">
          <input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) {
                onCreate(taskId, newTitle.trim());
                setNewTitle('');
              } else if (e.key === 'Escape') {
                setShowInput(false);
                setNewTitle('');
              }
            }}
            placeholder="Subtask title..."
            className="flex-1 text-base md:text-sm text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)]"
          />
          <button
            onClick={() => {
              if (newTitle.trim()) {
                onCreate(taskId, newTitle.trim());
                setNewTitle('');
              }
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-[0.97] transition-all"
          >
            Add
          </button>
          <button
            onClick={() => { setShowInput(false); setNewTitle(''); }}
            className="text-xs px-2 py-1.5 text-[var(--color-text-muted)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
