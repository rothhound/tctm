import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toNoonISO(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toISOString();
}

function isSameDay(year: number, month: number, day: number, ref: Date): boolean {
  return ref.getFullYear() === year && ref.getMonth() === month && ref.getDate() === day;
}

function formatShort(dateStr: string): { label: string; overdue: boolean } {
  const due = new Date(dateStr);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);

  if (days < 0) return { label: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { label: 'Today', overdue: false };
  if (days === 1) return { label: 'Tomorrow', overdue: false };
  if (days <= 7) return { label: `${days}d`, overdue: false };
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

interface InlineDatePickerProps {
  value: string | null;
  onChange: (isoDate: string | null) => void;
}

export function InlineDatePicker({ value, onChange }: InlineDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const initial = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  // Reset view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        calendarRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const calH = 340;
    const calW = 280;

    const fitsBelow = rect.bottom + calH + 4 <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + 4 : rect.top - calH - 4;

    const fitsRight = rect.left + calW <= window.innerWidth;
    const left = fitsRight ? rect.left : window.innerWidth - calW - 8;

    setPos({ top, left });
  }, []);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) computePosition();
    setOpen(!open);
  };

  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDate = (day: number) => {
    onChange(toNoonISO(toDateStr(viewYear, viewMonth, day)));
    setOpen(false);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = new Date();
  const currentDateStr = value ? value.slice(0, 10) : '';

  const formatted = value ? formatShort(value) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={`text-[10px] flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity ${
          formatted?.overdue ? 'text-[var(--color-danger)] font-medium' : 'text-[var(--color-text-muted)]'
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
          <path d="M1.5 5.5H12.5" />
        </svg>
        {formatted ? formatted.label : 'Set due date'}
      </button>

      {open && createPortal(
        <div
          ref={calendarRef}
          className="fixed z-[9999] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg p-3 w-[280px] animate-[fadeIn_150ms_ease-out]"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 2L3 6L7 10" /></svg>
            </button>
            <span className="text-sm font-medium text-[var(--color-text)]">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2L9 6L5 10" /></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-[var(--color-text-muted)] py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = toDateStr(viewYear, viewMonth, day);
              const isSelected = dateStr === currentDateStr;
              const isToday = isSameDay(viewYear, viewMonth, day, today);

              return (
                <button
                  key={day}
                  onClick={(e) => { e.stopPropagation(); selectDate(day); }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors ${
                    isSelected
                      ? 'bg-[var(--color-primary)] text-white'
                      : isToday
                        ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--color-border)]">
            <button
              onClick={(e) => { e.stopPropagation(); const n = new Date(); onChange(toNoonISO(toDateStr(n.getFullYear(), n.getMonth(), n.getDate()))); setOpen(false); }}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Today
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); const n = new Date(); n.setDate(n.getDate() + 1); onChange(toNoonISO(toDateStr(n.getFullYear(), n.getMonth(), n.getDate()))); setOpen(false); }}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Tomorrow
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); const n = new Date(); const d = (8 - n.getDay()) % 7 || 7; n.setDate(n.getDate() + d); onChange(toNoonISO(toDateStr(n.getFullYear(), n.getMonth(), n.getDate()))); setOpen(false); }}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Next week
            </button>
            {value && (
              <button
                onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
                className="text-xs text-[var(--color-danger)] hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
