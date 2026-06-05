import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Standard settings sub-page header: a small "‹ Settings" back-crumb on top, then the page title in
 * the standard heading style with an optional actions slot on the right, and an optional one-line
 * description below. Every settings/* screen should pass `current` + `description` for a consistent
 * title-over-description pattern. "Settings" links to /settings.
 */
export function SettingsBreadcrumb({
  current,
  description,
  actions,
}: {
  current: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/settings')}
        className="inline-flex items-center gap-1 -ml-1.5 mb-1.5 px-1.5 py-0.5 rounded-md text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M7.5 2.5L4 6l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Settings
      </button>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--color-text)] truncate">{current}</h1>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {description ? (
        <p className="text-xs text-[var(--color-text-muted)] mt-2.5 mb-2 md:mt-2 md:mb-1 leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}
