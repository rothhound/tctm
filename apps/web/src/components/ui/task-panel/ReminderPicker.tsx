import { useEffect, useState } from 'react';
import type { TaskDto } from '@tctm/shared';
import { IconZzz } from '../icons/task-panel-icons';
import { HoverTip } from './HoverTip';
import { toDateStr } from './helpers';

export function ReminderPicker({ task, onSnooze, onClearReminder, openTrigger = 0 }: { task: TaskDto; onSnooze: (date: string) => void; onClearReminder: () => void; openTrigger?: number }) {
  const [showPicker, setShowPicker] = useState(false);
  const hasReminder = !!task.reminderAt && new Date(task.reminderAt) > new Date();

  // External open trigger (e.g. from "Reschedule" quick action chip)
  useEffect(() => {
    if (openTrigger > 0) setShowPicker(true);
  }, [openTrigger]);

  useEffect(() => {
    if (!showPicker) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-reminder-picker]')) setShowPicker(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPicker]);

  const handleSnooze = (days: number) => {
    const n = new Date();
    n.setDate(n.getDate() + days);
    onSnooze(toDateStr(n.getFullYear(), n.getMonth(), n.getDate()));
    setShowPicker(false);
  };

  return (
    <div className="relative" data-reminder-picker>
      <HoverTip label={hasReminder ? 'Edit reminder' : 'Set reminder'}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={`shrink-0 w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-md transition-colors ${
            hasReminder
              ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
          }`}
          aria-label="Remind me"
        >
          <IconZzz size={20} />
        </button>
      </HoverTip>
      {showPicker && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg p-3 w-[260px] animate-[fadeIn_150ms_ease-out]">
          <p className="text-xs font-medium text-[var(--color-text)] mb-2">Remind me later</p>
          <div className="space-y-1">
            {[
              { label: 'Tomorrow', days: 1 },
              { label: 'In 3 days', days: 3 },
              { label: 'Next week', days: 7 },
              { label: 'In 2 weeks', days: 14 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleSnooze(opt.days)}
                className="w-full text-left text-sm px-2 py-1.5 rounded-md text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hasReminder && (
            <button
              onClick={() => { onClearReminder(); setShowPicker(false); }}
              className="w-full mt-2 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-danger)] hover:underline text-left px-2"
            >
              Clear reminder
            </button>
          )}
        </div>
      )}
    </div>
  );
}
