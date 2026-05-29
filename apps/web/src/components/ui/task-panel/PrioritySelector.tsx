import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconCheck } from '../icons/task-panel-icons';
import { PRIORITY_OPTIONS, priorityMeta } from './helpers';

export function PrioritySelector({ current, onChange, readonly, muted }: { current: string; onChange: (p: string) => void; readonly?: boolean; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = priorityMeta(current);
  const textCls = muted ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]';

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (readonly) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
        <span className={`text-xs font-medium ${textCls}`}>{meta.label}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-1.5 py-1 -ml-1.5 rounded-md hover:bg-[var(--color-surface-alt)] active:scale-[0.97] transition-all"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
        <span className={`text-xs font-medium ${textCls}`}>{meta.label}</span>
        <span className="text-[var(--color-text-muted)]"><IconChevronDown size={14} /></span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-50 top-full left-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 min-w-[140px] animate-[fadeIn_150ms_ease-out]"
        >
          {PRIORITY_OPTIONS.map((opt) => {
            const active = current === opt.value;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                  active ? 'bg-[var(--color-surface-alt)] font-medium' : 'hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.dot }} />
                <span className="text-[var(--color-text)]">{opt.label}</span>
                {active && (
                  <span className="ml-auto text-[var(--color-primary)]"><IconCheck size={14} /></span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
