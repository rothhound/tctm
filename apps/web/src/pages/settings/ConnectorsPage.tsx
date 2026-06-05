import { useEffect, useState } from 'react';
import { SettingsBreadcrumb } from '../../components/layout/SettingsBreadcrumb';
import { useGetIntegrationHealthQuery, useUpdateSourceConfigMutation, type IntegrationStatus } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { SourceIcon } from '../../components/ui/SourceIcon';
import { IconChevronRight } from '../../components/ui/icons/task-panel-icons';

const STATE_STYLE: Record<IntegrationStatus['state'], { label: string; dot: string; text: string; bg: string }> = {
  ok: { label: 'Connected', dot: '#1D7A5C', text: '#1D7A5C', bg: '#E1F5EE' },
  configured: { label: 'Connected', dot: '#1F6FCF', text: '#1F6FCF', bg: '#E6F1FB' },
  inactive: { label: 'Inactive', dot: '#A66B00', text: '#A66B00', bg: '#FAEEDA' },
  not_configured: { label: 'Not connected', dot: '#8a8780', text: '#6b6962', bg: '#f0eee9' },
  error: { label: 'Error', dot: '#C0362C', text: '#C0362C', bg: '#FBE9E7' },
};

function formatAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function ConnectorsPage() {
  usePageTitle('Connectors');
  const { data, isLoading, isFetching, refetch, fulfilledTimeStamp } = useGetIntegrationHealthQuery(undefined, { pollingInterval: 60_000 });
  // Re-render every 30s so the "checked … ago" label stays fresh between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const lastChecked = fulfilledTimeStamp ? formatAgo(fulfilledTimeStamp) : null;
  const [updateSourceConfig] = useUpdateSourceConfigMutation();
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState<IntegrationStatus | null>(null);

  // enabled = c.paused: resuming (currently paused) re-enables; pausing disables.
  const applyToggle = async (c: IntegrationStatus) => {
    const source = c.name.toLowerCase();
    setPendingSource(source);
    try {
      await updateSourceConfig({ source, enabled: c.paused }).unwrap();
    } finally {
      setPendingSource(null);
      setConfirmPause(null);
    }
  };

  // Resume applies immediately; pausing first asks for confirmation (it silently drops incoming signals).
  const onToggleClick = (c: IntegrationStatus) => {
    if (c.paused) applyToggle(c);
    else setConfirmPause(c);
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <SettingsBreadcrumb
          current="Connectors"
          description={
            <>
              Live status of each integration. An <span className="font-medium">Error</span> means ingestion from that source may be failing.
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              {(isFetching || lastChecked) && (
                <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                  {isFetching ? 'Checking…' : `Checked ${lastChecked}`}
                </span>
              )}
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-sm px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50 transition-colors"
              >
                Refresh
              </button>
            </div>
          }
        />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
          {(data ?? []).map((c) => {
            const s = STATE_STYLE[c.state] ?? STATE_STYLE.not_configured;
            return (
              <div key={c.name} className={`bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)] ${c.paused ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <SourceIcon source={c.name.toLowerCase()} size={18} />
                    <span className="text-sm font-medium text-[var(--color-text)] truncate">{c.name}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.paused ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ color: '#A66B00', background: '#FAEEDA' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#A66B00' }} />
                        Paused
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ color: s.text, background: s.bg }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                        {s.label}
                      </span>
                    )}
                    <button
                      onClick={() => onToggleClick(c)}
                      disabled={pendingSource === c.name.toLowerCase()}
                      className="text-[11px] px-2 py-0.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50 transition-colors"
                    >
                      {pendingSource === c.name.toLowerCase() ? '…' : c.paused ? 'Resume' : 'Pause'}
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
                  <span className="break-words min-w-0">{c.detail}</span>
                  <span className="whitespace-nowrap shrink-0">
                    Signals — All time: <span className="font-semibold text-[var(--color-text)] tabular-nums">{c.signalsAllTime}</span>
                    <span className="text-[var(--color-border)]"> · </span>
                    Today: <span className="font-semibold text-[var(--color-text)] tabular-nums">{c.signalsToday}</span>
                  </span>
                </div>

                {c.tracks?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                    <button
                      onClick={() => toggleExpanded(c.name)}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                      aria-expanded={expanded.has(c.name)}
                    >
                      <span className={`inline-flex transition-transform ${expanded.has(c.name) ? 'rotate-90' : ''}`}>
                        <IconChevronRight size={16} />
                      </span>
                      What we track
                    </button>
                    {expanded.has(c.name) && (
                      <ul className="mt-1.5 space-y-1.5">
                        {c.tracks.map((t, i) => (
                          <li key={i} className="text-[11px] leading-snug">
                            <span className="font-medium text-[var(--color-text)]">{t.label}</span>
                            <span className="text-[var(--color-text-muted)]"> — {t.example}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmPause && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_150ms_ease-out]"
            onClick={() => pendingSource === null && setConfirmPause(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)] p-5 animate-[slideUp_200ms_ease-out]">
              <div className="flex items-center gap-2.5">
                <SourceIcon source={confirmPause.name.toLowerCase()} size={20} />
                <h2 className="text-base font-semibold text-[var(--color-text)]">Pause {confirmPause.name}?</h2>
              </div>
              <p className="text-[13px] text-[var(--color-text-muted)] mt-3">
                While {confirmPause.name} is paused:
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] text-[var(--color-text-muted)] list-disc pl-5">
                <li>Incoming {confirmPause.name} signals are <span className="font-medium text-[var(--color-text)]">skipped</span> — they won't be turned into tasks.</li>
                <li>Anything that arrives while paused is <span className="font-medium text-[var(--color-text)]">missed</span>: signals are not re-processed when you resume.</li>
                <li>Tasks already created from {confirmPause.name} are unaffected.</li>
              </ul>
              <p className="text-[13px] text-[var(--color-text-muted)] mt-3">You can resume anytime from this page.</p>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setConfirmPause(null)}
                  disabled={pendingSource !== null}
                  className="text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => applyToggle(confirmPause)}
                  disabled={pendingSource !== null}
                  className="text-xs px-3 py-1.5 rounded-md bg-[#A66B00] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {pendingSource !== null ? 'Pausing…' : `Pause ${confirmPause.name}`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
