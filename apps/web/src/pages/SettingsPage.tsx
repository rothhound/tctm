import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../store/hooks';
import { logout } from '../store/authSlice';
import { usePageTitle } from '../hooks/usePageTitle';
import { usePushNotifications } from '../hooks/usePushNotifications';

const SECTIONS = [
  { path: '/settings/connectors', label: 'Connectors', desc: 'Integration health & errors', icon: '🔌' },
  { path: '/settings/entities', label: 'Contacts & Entities', desc: 'People, companies, funds, deals', icon: '👤' },
  // Source Thresholds hidden from the menu (route still reachable at /settings/thresholds).
  { path: '/settings/prompts', label: 'Prompt Versions', desc: 'View, activate, and rollback LLM prompts', icon: '📝' },
  { path: '/settings/metrics', label: 'Metrics', desc: 'Signal volume, LLM costs, extraction ratio', icon: '📊' },
  { path: '/settings/audit', label: 'Audit Log', desc: 'Every LLM call with cost and latency', icon: '🔍' },
] as const;

function NotificationToggle() {
  const { isSupported, isSubscribed, loading, subscribe, unsubscribe } = usePushNotifications();
  return (
    <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] px-4 py-3.5 flex items-center gap-3.5">
      <span className="text-lg shrink-0 w-8 text-center">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">Notifications</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          {isSupported
            ? 'Get a push when a new task is captured — even when the app is closed.'
            : 'Not available in this browser.'}
        </p>
      </div>
      <label className={`relative inline-flex items-center shrink-0 ${isSupported && !loading ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
        <input
          type="checkbox"
          checked={isSubscribed}
          disabled={!isSupported || loading}
          onChange={(e) => (e.target.checked ? subscribe() : unsubscribe())}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-[var(--color-border)] peer-checked:bg-[var(--color-success)] rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
      </label>
    </div>
  );
}

export function SettingsPage() {
  usePageTitle('Settings');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-2.5 mb-2 md:mt-2 md:mb-1 leading-relaxed">
          Connectors, contacts, extraction tuning, and system logs.
        </p>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
        <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          {SECTIONS.map((s) => (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-[var(--color-surface-alt)] transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-lg shrink-0 w-8 text-center">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)]">{s.label}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{s.desc}</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" className="shrink-0">
                <path d="M6 3.5L10.5 8L6 12.5" />
              </svg>
            </button>
          ))}
        </div>

        <NotificationToggle />

        <button
          onClick={() => { dispatch(logout()); navigate('/login', { replace: true }); }}
          className="w-full py-3 rounded-lg text-sm font-medium text-[var(--color-danger)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-danger-light)] transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
