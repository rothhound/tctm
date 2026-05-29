import type { ReactNode } from 'react';

export function HoverTip({ children, label, position = 'bottom' }: { children: ReactNode; label: string; position?: 'bottom' | 'top' }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        className={`pointer-events-none hidden md:block absolute left-1/2 -translate-x-1/2 ${
          position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        } z-50 px-2 py-1 rounded-md text-[10px] font-medium text-white bg-[var(--color-text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      >
        {label}
      </span>
    </span>
  );
}
