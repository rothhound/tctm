import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetPromptVersionsQuery, useActivatePromptVersionMutation } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';

const PURPOSES = [
  { key: 'extract', label: 'Extract' },
  { key: 'judge', label: 'Judge' },
  { key: 'snooze', label: 'Snooze' },
  { key: 'resolve', label: 'Resolve' },
] as const;

export function PromptsPage() {
  usePageTitle('Prompt Versions');
  const navigate = useNavigate();
  const [purpose, setPurpose] = useState<string>('extract');
  const { data: versions, isLoading } = useGetPromptVersionsQuery(purpose);
  const [activate] = useActivatePromptVersionMutation();

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8.5 3L4.5 7L8.5 11" /></svg>
          Settings
        </button>
        <h1 className="text-lg font-semibold text-[var(--color-text)] mb-3">Prompt Versions</h1>

        {/* Purpose tabs */}
        <div className="flex gap-1.5">
          {PURPOSES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPurpose(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                purpose === p.key
                  ? 'bg-[var(--color-text)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
        {isLoading && <LoadingSpinner />}
        {!isLoading && !versions?.length && <EmptyState message="No prompt versions found. Run db:seed to create initial prompts." />}

        {(versions ?? []).map((v: any) => (
          <div
            key={v.id}
            className={`bg-[var(--color-surface)] rounded-lg border overflow-hidden ${
              v.active ? 'border-[var(--color-success)]' : 'border-[var(--color-border)]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">v{v.version}</span>
                {v.active && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#E1F5EE] text-[#1D7A5C]">Active</span>
                )}
                {v.metadata?.createdBy && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]">
                    {v.metadata.createdBy}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {new Date(v.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            {/* Body */}
            <div className="px-4 pb-3 space-y-2">
              {v.metadata?.reason && (
                <p className="text-xs text-[var(--color-text-muted)]">{v.metadata.reason}</p>
              )}

              {v.performance && (
                <div className="flex gap-4 text-[11px]">
                  {v.performance.precision != null && (
                    <div>
                      <span className="text-[var(--color-text-muted)]">Precision </span>
                      <span className="font-medium text-[var(--color-text)]">{Math.round(v.performance.precision * 100)}%</span>
                    </div>
                  )}
                  {v.performance.recall != null && (
                    <div>
                      <span className="text-[var(--color-text-muted)]">Recall </span>
                      <span className="font-medium text-[var(--color-text)]">{Math.round(v.performance.recall * 100)}%</span>
                    </div>
                  )}
                </div>
              )}

              {v.metadata?.diff && (
                <details>
                  <summary className="text-[11px] text-[var(--color-primary)] cursor-pointer hover:underline">
                    Suggested changes
                  </summary>
                  <pre className="mt-1.5 text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap bg-[var(--color-surface-alt)] p-3 rounded-md max-h-40 overflow-y-auto">
                    {v.metadata.diff}
                  </pre>
                </details>
              )}

              <details>
                <summary className="text-[11px] text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text)]">
                  View prompt ({v.content?.length ?? 0} chars)
                </summary>
                <pre className="mt-1.5 text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap bg-[var(--color-surface-alt)] p-3 rounded-md max-h-60 overflow-y-auto">
                  {v.content}
                </pre>
              </details>

              {!v.active && (
                <button
                  onClick={() => activate(v.id)}
                  className="w-full mt-1 py-2.5 text-xs font-medium rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
                >
                  Activate this version
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
