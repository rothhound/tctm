import { useState } from 'react';
import { SettingsBreadcrumb } from '../../components/layout/SettingsBreadcrumb';
import { useGetAuditLogQuery } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterDropdown } from '../../components/ui/FilterDropdown';

const PURPOSE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'extract', label: 'Extract' },
  { value: 'judge', label: 'Judge' },
];

export function AuditLogPage() {
  usePageTitle('Audit Log');
  const [purpose, setPurpose] = useState<string>('');
  const { data: entries, isLoading } = useGetAuditLogQuery(
    purpose ? { purpose, limit: 50 } : { limit: 50 },
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <SettingsBreadcrumb
          current="Audit Log"
          description="Every LLM call with its prompt version, cost, and latency."
          actions={
            <FilterDropdown
              label="Purpose"
              value={purpose}
              defaultValue="__none__"
              options={PURPOSE_OPTIONS}
              onChange={setPurpose}
            />
          }
        />
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
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
