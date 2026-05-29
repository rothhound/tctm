import { NavLink } from 'react-router-dom';

export function BottomNav() {

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-lg mx-auto flex">
        {[
          { to: '/active', label: 'Active' },
          { to: '/snoozed', label: 'Snoozed' },
          { to: '/archive', label: 'Archived' },
          { to: '/reported', label: 'Reported' },
        ].map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-3 text-xs min-h-[48px] ${
                isActive ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)]'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
