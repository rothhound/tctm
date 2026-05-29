import { NavLink, useNavigate } from 'react-router-dom';
import { TctmLogo } from '../ui/TctmLogo';

export function SideNav() {
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex flex-col w-40 border-r border-[var(--color-border)] bg-[var(--color-surface-alt)] h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center justify-center py-4 border-b border-[var(--color-border)]">
        <TctmLogo size={36} />
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        <NavLink
          to="/active"
          className={({ isActive }) =>
            `flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
            }`
          }
        >
          Active
        </NavLink>
        <NavLink
          to="/snoozed"
          className={({ isActive }) =>
            `flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
            }`
          }
        >
          Snoozed
        </NavLink>
        <NavLink
          to="/archive"
          className={({ isActive }) =>
            `flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
            }`
          }
        >
          Archived
        </NavLink>
        <NavLink
          to="/reported"
          className={({ isActive }) =>
            `flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
            }`
          }
        >
          Reported
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-[var(--color-border)]">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center w-full px-3 py-2 rounded-md text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-colors"
        >
          Settings
        </button>
      </div>
    </aside>
  );
}
