import { IconZzz, IconArchive } from '../icons/task-panel-icons';
import { formatDate, relativeFrom } from './helpers';

export function SnoozedBanner({ wakeAt, onWakeNow }: { wakeAt: string; onWakeNow: () => void }) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3 bg-linear-to-br from-[#fef3e8] to-[#fce0bf]">
      <div className="w-11 h-11 rounded-full bg-white/70 flex items-center justify-center text-[var(--color-warning)] shrink-0">
        <IconZzz size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#8b5e08]">Wakes up {formatDate(wakeAt)}</p>
        <p className="text-[10px] text-[#a47723]">{relativeFrom(wakeAt)}</p>
      </div>
      <button
        onClick={onWakeNow}
        className="text-xs font-medium px-3 py-1.5 rounded-md bg-white text-[var(--color-warning)] hover:opacity-90 active:scale-[0.97] transition-all shrink-0"
      >
        Wake now
      </button>
    </div>
  );
}

export function ArchivedBanner({ archivedAt }: { archivedAt: string }) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3 bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
      <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[var(--color-text-muted)] shrink-0">
        <IconArchive size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--color-text-muted)]">Archived {formatDate(archivedAt)}</p>
        <p className="text-[10px] text-[var(--color-text-muted)]">{relativeFrom(archivedAt)}</p>
      </div>
    </div>
  );
}
