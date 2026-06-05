import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NavBadge } from '../ui/NavBadge';
import { useBucketBadges } from '../../hooks/useBucketBadges';

// Everyday views stay on the bar; the rest (incl. Settings) live under "⋯ More" — phone bars fit ~4.
const PRIMARY = [
  { to: '/active', label: 'Active' },
  { to: '/done', label: 'Done' },
  { to: '/snoozed', label: 'Snoozed' },
];
const MORE = [
  { to: '/archive', label: 'Archived' },
  { to: '/filtered', label: 'Filtered' },
  { to: '/reported', label: 'Reported' },
  { to: '/settings', label: 'Settings' },
];

const tabClass = (active: boolean) =>
  `flex-1 flex flex-col items-center justify-center py-3 text-xs min-h-[48px] ${
    active ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)]'
  }`;

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const moreActive = MORE.some((m) => pathname.startsWith(m.to));
  const badges = useBucketBadges();
  const badgeFor: Record<string, number> = {
    '/active': badges.active,
    '/snoozed': badges.snoozed,
    '/filtered': badges.filtered,
  };
  // Anything hidden under "More" that has new items → show a dot on the More button.
  const moreHasNew = MORE.some((m) => (badgeFor[m.to] ?? 0) > 0);

  return (
    <div className="lg:hidden">
      {/* Backdrop closes the sheet on outside tap */}
      {moreOpen && <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* "More" overflow sheet — anchored above the More tab */}
        {moreOpen && (
          <div className="absolute bottom-full right-2 mb-2 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden">
            {MORE.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3 text-sm min-h-[44px] ${
                    isActive
                      ? 'text-[var(--color-primary)] font-medium bg-[var(--color-surface-alt)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
                  }`
                }
              >
                <span>{label}</span>
                <NavBadge count={badgeFor[to] ?? 0} className="ml-auto" />
              </NavLink>
            ))}
          </div>
        )}

        <div className="max-w-lg mx-auto flex">
          {PRIMARY.map(({ to, label }) => (
            <NavLink key={to} to={to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `${tabClass(isActive)} relative`}>
              <span className="relative">
                {label}
                <NavBadge count={badgeFor[to] ?? 0} className="absolute -top-2.5 -right-4" />
              </span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="More"
            className={`${tabClass(moreOpen || moreActive)} relative`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
            {moreHasNew && (
              <span className="absolute top-2 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-[var(--color-primary)]" />
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}
