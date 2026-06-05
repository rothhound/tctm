import { SettingsBreadcrumb } from '../../components/layout/SettingsBreadcrumb';
import { useGetMetricsQuery } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4">
      <p className="text-[11px] text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-xl font-semibold text-[var(--color-text)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-b-0">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="text-sm font-medium text-[var(--color-text)]">{value}</span>
    </div>
  );
}

export function MetricsPage() {
  usePageTitle('Metrics');
  const { data: metrics, isLoading } = useGetMetricsQuery({ days: 30 });

  const signalEntries = Object.entries(metrics?.signalsBySource ?? {}) as [string, number][];
  const taskEntries = Object.entries(metrics?.tasksByStatus ?? {}) as [string, number][];

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <SettingsBreadcrumb
          current="Metrics"
          description="Signal volume, LLM cost, and extraction ratio. Last 30 days."
        />
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
        {isLoading ? (
          <LoadingSpinner />
        ) : !metrics ? (
          <EmptyState message="No metrics yet." />
        ) : (
          <>
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Auto-create ratio"
            value={`${Math.round((metrics.autoCreateRatio ?? 0) * 100)}%`}
          />
          <StatCard
            label="Total LLM cost"
            value={`$${(metrics.totalLlmCostUsd ?? 0).toFixed(2)}`}
          />
        </div>

        {/* Signals by source */}
        <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-medium text-[var(--color-text)]">Signals by Source</h2>
          </div>
          <div className="px-4">
            {signalEntries.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">No signals yet</p>
            )}
            {signalEntries.map(([source, count]) => (
              <MetricRow key={source} label={source.charAt(0).toUpperCase() + source.slice(1)} value={count} />
            ))}
          </div>
        </div>

        {/* Tasks by status */}
        <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-medium text-[var(--color-text)]">Tasks by Status</h2>
          </div>
          <div className="px-4">
            {taskEntries.map(([status, count]) => (
              <MetricRow key={status} label={status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())} value={count} />
            ))}
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
