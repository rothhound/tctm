import { useEffect, useRef, useState } from 'react';
import { IconCalendar, IconChevronDown, stroke } from '../icons/task-panel-icons';
import { DAYS, MONTHS, toDateStr } from './helpers';

export function DueDateChip({ value, onChange, muted }: { value: string | null; onChange: (date: string | null) => void; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initial = value ? new Date(value + 'T12:00:00') : new Date();
  const [vy, setVy] = useState(initial.getFullYear());
  const [vm, setVm] = useState(initial.getMonth());

  const APPROX_HEIGHT = 360;
  const DESIRED_WIDTH = 280;
  const MARGIN = 8;

  const computeCoords = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(DESIRED_WIDTH, vw - MARGIN * 2);

    const spaceBelow = vh - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const placeAbove = spaceBelow < APPROX_HEIGHT && spaceAbove > spaceBelow;

    const top = placeAbove
      ? Math.max(MARGIN, rect.top - APPROX_HEIGHT - 4)
      : Math.min(rect.bottom + 4, vh - APPROX_HEIGHT - MARGIN);

    let left = rect.left;
    if (left + width > vw - MARGIN) left = vw - width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setCoords({ top, left, width });
  };

  const toggleOpen = () => {
    if (!open) computeCoords();
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const firstDay = new Date(vy, vm, 1).getDay();
  const today = new Date();

  const pick = (d: number) => { onChange(toDateStr(vy, vm, d)); setOpen(false); };

  const label = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No due date';

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.97] ${
          muted
            ? 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
            : value
              ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:opacity-90'
              : 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
        }`}
      >
        <IconCalendar size={16} />
        <span>{label}</span>
        <IconChevronDown size={16} />
      </button>
      {open && coords && (
        <div
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
          className="z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg p-3 animate-[fadeIn_150ms_ease-out]"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => { if (vm === 0) { setVm(11); setVy(vy - 1); } else setVm(vm - 1); }}
              className="w-9 h-9 flex items-center justify-center rounded hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]"
            >
              <svg width="18" height="18" viewBox="0 0 12 12" {...stroke}><path d="M7 2L3 6L7 10" /></svg>
            </button>
            <span className="text-sm font-medium text-[var(--color-text)]">{MONTHS[vm]} {vy}</span>
            <button
              onClick={() => { if (vm === 11) { setVm(0); setVy(vy + 1); } else setVm(vm + 1); }}
              className="w-9 h-9 flex items-center justify-center rounded hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]"
            >
              <svg width="18" height="18" viewBox="0 0 12 12" {...stroke}><path d="M5 2L9 6L5 10" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-[var(--color-text-muted)] py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const s = toDateStr(vy, vm, d);
              const isSel = s === (value ?? '');
              const isToday = today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === d;
              return (
                <button
                  key={d}
                  onClick={() => pick(d)}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors ${
                    isSel ? 'bg-[var(--color-primary)] text-white'
                      : isToday ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
                  }`}
                >{d}</button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => { const n = new Date(); onChange(toDateStr(n.getFullYear(), n.getMonth(), n.getDate())); setOpen(false); }} className="text-xs text-[var(--color-primary)] hover:underline">Today</button>
            <button onClick={() => { const n = new Date(); n.setDate(n.getDate() + 1); onChange(toDateStr(n.getFullYear(), n.getMonth(), n.getDate())); setOpen(false); }} className="text-xs text-[var(--color-primary)] hover:underline">Tomorrow</button>
            <button onClick={() => { const n = new Date(); const d = (8 - n.getDay()) % 7 || 7; n.setDate(n.getDate() + d); onChange(toDateStr(n.getFullYear(), n.getMonth(), n.getDate())); setOpen(false); }} className="text-xs text-[var(--color-primary)] hover:underline">Next week</button>
            {value && <button onClick={() => { onChange(null); setOpen(false); }} className="text-xs text-[var(--color-danger)] hover:underline">Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}
