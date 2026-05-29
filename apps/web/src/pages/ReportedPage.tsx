import { useState } from 'react';
import { REPORT_REASON_LABELS } from '@tctm/shared';
import type { ReportReason } from '@tctm/shared';
import { useGetReportedTasksQuery, useUnreportTaskMutation } from '../store/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskPanel } from '../components/ui/TaskPanel';
import { SourceIcon } from '../components/ui/SourceIcon';

export function ReportedPage() {
  usePageTitle('Reported');
  const { data: tasks, isLoading } = useGetReportedTasksQuery();
  const [unreport] = useUnreportTaskMutation();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="shrink-0 px-4 md:px-0">
          <h1 className="text-lg font-semibold text-[var(--color-text)] mb-1">
            Reported ({tasks?.length ?? 0})
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mb-1 md:mb-4">
            Items incorrectly captured by the system. Your feedback trains the AI to get better over time.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0">
          {(!tasks || tasks.length === 0) && <EmptyState message="No issues reported. Everything looks accurate so far." />}

          <div className="bg-[var(--color-surface-alt)] rounded-lg px-3 py-2 space-y-1.5">
            {(tasks ?? []).map((task) => {
              const reasonLabel = task.reportReason
                ? task.reportReason.startsWith('other: ')
                  ? task.reportReason.slice(7)
                  : REPORT_REASON_LABELS[task.reportReason as ReportReason] ?? task.reportReason
                : null;

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)] border-l-2 border-l-[var(--color-danger)] flex justify-between items-start cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--color-text)]">{task.title}</p>
                    {task.description && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                        {task.description.replace(/<[^>]+>/g, '')}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {task.source && <SourceIcon source={task.source} size={12} />}
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        Reported {task.reportedAt ? new Date(task.reportedAt).toLocaleDateString() : ''}
                      </span>
                      {reasonLabel && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-danger-light)] text-[var(--color-danger)]">
                          {reasonLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); unreport(task.id); }}
                    className="text-xs text-[var(--color-primary)] px-2 py-1 shrink-0 min-h-[36px]"
                  >
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedTaskId && (
        <TaskPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </>
  );
}
