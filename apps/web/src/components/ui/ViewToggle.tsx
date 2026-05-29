import { useEffect, useState } from 'react';

export type ViewMode = 'list' | 'kanban';

const STORAGE_KEY = 'tctm-view-mode';

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(
    () => (localStorage.getItem(STORAGE_KEY) as ViewMode) ?? 'list',
  );

  const setMode = (newMode: ViewMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  return [mode, setMode];
}

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex bg-[var(--color-surface-alt)] rounded-md p-0.5">
      <button
        onClick={() => onChange('list')}
        className={`px-2.5 py-1 text-xs rounded transition-colors ${
          mode === 'list'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
            : 'text-[var(--color-text-muted)]'
        }`}
        title="List view"
      >
        {/* List icon */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="1" y1="3" x2="13" y2="3" />
          <line x1="1" y1="7" x2="13" y2="7" />
          <line x1="1" y1="11" x2="13" y2="11" />
        </svg>
      </button>
      <button
        onClick={() => onChange('kanban')}
        className={`px-2.5 py-1 text-xs rounded transition-colors ${
          mode === 'kanban'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
            : 'text-[var(--color-text-muted)]'
        }`}
        title="Kanban view"
      >
        {/* Kanban icon */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="3.5" height="12" rx="0.5" />
          <rect x="5.25" y="1" width="3.5" height="8" rx="0.5" />
          <rect x="9.5" y="1" width="3.5" height="10" rx="0.5" />
        </svg>
      </button>
    </div>
  );
}
