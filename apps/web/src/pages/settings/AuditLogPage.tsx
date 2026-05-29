import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetAuditLogQuery } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'extract', label: 'Extract' },
  { key: 'judge', label: 'Judge' },
] as const;

export function AuditLogPage() {
  usePageTitle('Audit Log');
  const navigate = useNavigate();
  const [purpose, setPurpose] = useState<string>('');
  const { data: entries, isLoading } = useGetAuditLogQuery(
    purpose ? { purpose, limit: 50 } : { limit: 50 },
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8.5 3L4.5 7L8.5 11" /></svg>
          Settings
        </button>
        <h1 className="text-lg font-semibold text-[var(--color-text)] mb-3">Audit Log</h1>

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setPurpose(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                purpose === f.key
                  ? 'bg-[var(--color-text)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0">
        {isLoading && <LoadingSpinner />}
        {!isLoading && (!entries || entries.length === 0) && (
          <EmptyState message="No activity yet. LLM calls will be logged here as tasks are processed." />
        )}

        {entries && entries.length > 0 && (
          <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {entries.map((entry: any) => (
              <div key={entry.id} className="px-4 py-3 hover:bg-[var(--color-surface-alt)] transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--color-text)]">{entry.purpose}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]">
                      {entry.model}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(entry.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                  <span>{entry.inputTokens ?? 0} in</span>
                  <span>{entry.outputTokens ?? 0} out</span>
                  {entry.costUsd != null && <span>${entry.costUsd.toFixed(4)}</span>}
                  {entry.latencyMs != null && <span>{entry.latencyMs}ms</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {entries && entries.length > 0 && (
          <p className="text-[10px] text-[var(--color-text-muted)] text-center py-3">
            Showing {entries.length} entries
          </p>
        )}
      </div>
    </div>
  );
}
