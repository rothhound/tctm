import type { TaskDto } from '@tctm/shared';
import { IconChevronDown } from '../icons/task-panel-icons';
import type { PanelMode } from './helpers';

export function PanelFooter({
  task, mode, onArchive, onUnarchive, onComplete, onClose,
}: {
  task: TaskDto;
  mode: PanelMode;
  onArchive: () => void;
  onUnarchive: () => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  const isArchived = mode === 'archived';

  return (
    <div className="px-4 md:px-5 py-3 border-t border-[var(--color-border)]">
      {isArchived ? (
        <button
          onClick={() => { onUnarchive(); onClose(); }}
          className="w-full py-2.5 text-sm font-medium rounded-md bg-[var(--color-text)] text-white hover:opacity-90 active:scale-[0.97] transition-all"
        >
          Restore to active
        </button>
      ) : task.status === 'pending' ? (
        <div className="flex gap-2">
          <button
            onClick={() => { onArchive(); onClose(); }}
            className="flex-1 py-2.5 text-sm font-medium rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
          >
            <span>Archive</span>
          </button>
          <button
            onClick={() => { onComplete(); onClose(); }}
            className="flex-1 py-2.5 text-sm font-medium rounded-md bg-[var(--color-success)] text-white hover:opacity-90 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
          >
            <span>Complete</span>
          </button>
        </div>
      ) : null}

      <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-3 hidden md:block">
        Press <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text)] text-[9px] font-mono">Esc</kbd> to close
      </p>
      <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-3 md:hidden flex items-center justify-center gap-1">
        Swipe down to close <IconChevronDown size={14} />
      </p>
    </div>
  );
}
