import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { TaskPriority } from '@tctm/shared';

// Matches TaskCard's PRIORITY_PILL (bg/text/label) and the kanban column dot colors.
const PRIORITY_OPTIONS: { value: TaskPriority; label: string; bg: string; text: string; dot: string }[] = [
  { value: 'high', label: 'High', bg: '#FCEBEB', text: '#C0392B', dot: '#E24B4A' },
  { value: 'mid',  label: 'Med',  bg: '#FAEEDA', text: '#A66B00', dot: '#EF9F27' },
  { value: 'low',  label: 'Low',  bg: '#E6F4DC', text: '#4F7A2E', dot: '#97C459' },
  { value: 'none', label: 'None', bg: '#f5f2ed', text: '#6b6962', dot: '#d5d0c8' },
];

interface InlinePriorityPickerProps {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}

/**
 * Click-to-edit priority pill — the same inline-editing pattern as InlineDatePicker.
 * The trigger looks identical to the static priority pill; clicking opens a small menu.
 */
export function InlinePriorityPicker({ value, onChange }: InlinePriorityPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = PRIORITY_OPTIONS.find((o) => o.value === value) ?? PRIORITY_OPTIONS[3];

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuH = 168;
    const menuW = 132;
    const fitsBelow = rect.bottom + menuH + 4 <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + 4 : rect.top - menuH - 4;
    // Right-align the menu to the trigger (the pill sits at the card's right edge).
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    setPos({ top, left });
  }, []);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) computePosition();
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        aria-label="Change priority"
        className="text-[10px] font-medium leading-none cursor-pointer hover:opacity-70 transition-opacity"
        style={{ background: current.bg, color: current.text, padding: '3px 7px', borderRadius: 999 }}
      >
        {current.label}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 w-[132px] animate-[fadeIn_150ms_ease-out]"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {PRIORITY_OPTIONS.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 transition-colors ${
                  selected ? 'bg-[var(--color-surface-alt)] font-medium' : 'hover:bg-[var(--color-surface-alt)]'
                } text-[var(--color-text)]`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: opt.dot }} />
                  {opt.label}
                </span>
                {selected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2.5 6.2L5 8.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
