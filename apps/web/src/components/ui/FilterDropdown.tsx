import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterDropdownProps<T extends string> {
  label: string;
  value: T;
  options: FilterOption<T>[];
  defaultValue: T;
  onChange: (v: T) => void;
  renderOption?: (opt: FilterOption<T>) => React.ReactNode;
  placeholder?: string;
}

export function FilterDropdown<T extends string>({
  label,
  value,
  options,
  defaultValue,
  onChange,
  renderOption,
  placeholder = 'Any',
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = value !== defaultValue;
  const selectedLabel = options.find((o) => o.value === value)?.label ?? label;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (!btnRef.current) return;
    if (!open) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuW = 180;
      const fitsRight = rect.left + menuW <= window.innerWidth;
      const left = fitsRight ? rect.left : window.innerWidth - menuW - 8;
      setPos({ top: rect.bottom + 4, left });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border ${
          active
            ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
            : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'
        }`}
      >
        <span className={active ? '' : 'text-[var(--color-text-muted)]'}>{label}:</span>
        <span className="font-medium">{active ? selectedLabel : placeholder}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 4L5 7L8 4" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 min-w-[180px] animate-[fadeIn_120ms_ease-out]"
          style={{ top: pos.top, left: pos.left }}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 transition-colors ${
                  selected
                    ? 'bg-[var(--color-surface-alt)] text-[var(--color-text)] font-medium'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  {renderOption ? renderOption(opt) : opt.label}
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
