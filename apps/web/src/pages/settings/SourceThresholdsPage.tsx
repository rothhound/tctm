import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetSourceConfigsQuery, useUpdateSourceConfigMutation } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

const AXES = [
  { key: 'explicitness', label: 'Explicitness' },
  { key: 'actionability', label: 'Actionability' },
  { key: 'addressedToUser', label: 'Addressed to user' },
  { key: 'overallConfidence', label: 'Overall confidence' },
] as const;

export function SourceThresholdsPage() {
  usePageTitle('Source Thresholds');
  const navigate = useNavigate();
  const { data: configs, isLoading } = useGetSourceConfigsQuery();
  const [updateConfig] = useUpdateSourceConfigMutation();
  const [editing, setEditing] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8.5 3L4.5 7L8.5 11" /></svg>
          Settings
        </button>
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Source Thresholds</h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Adjust auto-create thresholds per source. Higher values are more conservative.
        </p>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
        {(configs ?? []).map((config: any) => {
          const isEditing = editing === config.source;
          return (
            <div
              key={config.source}
              className={`bg-[var(--color-surface)] rounded-lg border overflow-hidden transition-colors ${
                isEditing ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)] capitalize">{config.source.replace('_', ' ')}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    config.enabled ? 'bg-[#E1F5EE] text-[#1D7A5C]' : 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]'
                  }`}>
                    {config.enabled ? 'On' : 'Off'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => updateConfig({ source: config.source, enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[var(--color-border)] peer-checked:bg-[var(--color-success)] rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>

              {isEditing ? (
                <div className="px-4 pb-4 space-y-3">
                  {AXES.map(({ key, label }) => {
                    const val = Math.round((config.thresholds.autoCreate[key] ?? 0.5) * 100);
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--color-text-muted)]">{label}</span>
                          <span className="text-[11px] font-medium text-[var(--color-text)]">{val}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={val}
                          onChange={(e) => {
                            updateConfig({
                              source: config.source,
                              thresholds: {
                                ...config.thresholds,
                                autoCreate: { ...config.thresholds.autoCreate, [key]: parseInt(e.target.value) / 100 },
                              },
                            });
                          }}
                          className="w-full h-1.5 bg-[var(--color-surface-alt)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                        />
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setEditing(null)}
                    className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="px-4 pb-3">
                  <div className="flex gap-3 text-[11px] text-[var(--color-text-muted)] mb-2">
                    {AXES.map(({ key, label }) => (
                      <span key={key}>{label.split(' ')[0]}: {Math.round((config.thresholds.autoCreate[key] ?? 0.5) * 100)}%</span>
                    ))}
                  </div>
                  <button
                    onClick={() => setEditing(config.source)}
                    className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    Edit thresholds
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
