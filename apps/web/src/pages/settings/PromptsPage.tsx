import { useState } from 'react';
import { SettingsBreadcrumb } from '../../components/layout/SettingsBreadcrumb';
import { useGetPromptVersionsQuery, useActivatePromptVersionMutation } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterDropdown } from '../../components/ui/FilterDropdown';

const PURPOSE_OPTIONS = [
  { value: 'extract', label: 'Extract' },
  { value: 'judge', label: 'Judge' },
];

export function PromptsPage() {
  usePageTitle('Prompt Versions');
  const [purpose, setPurpose] = useState<string>('extract');
  const { data: versions, isLoading } = useGetPromptVersionsQuery(purpose);
  const [activate] = useActivatePromptVersionMutation();

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <SettingsBreadcrumb
          current="Prompt Versions"
          description={
            <>
              Each LLM prompt is versioned. Pick a <span className="font-medium">purpose</span> to review its history, compare
              performance, and activate or roll back a version — no redeploy needed.
            </>
          }
          actions={
            // Sentinel defaultValue so the current purpose always shows as the label.
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
