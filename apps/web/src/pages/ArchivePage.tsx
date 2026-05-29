import { useState } from 'react';
import { useGetArchivedTasksQuery, useUnarchiveTaskMutation } from '../store/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskPanel } from '../components/ui/TaskPanel';

export function ArchivePage() {
  usePageTitle('Archived');
  const { data: tasks, isLoading } = useGetArchivedTasksQuery();
  const [unarchive] = useUnarchiveTaskMutation();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="shrink-0 px-4 md:px-0">
          <h1 className="text-lg font-semibold text-[var(--color-text)] mb-1">
            Archive{tasks && tasks.length > 0 ? ` (${tasks.length})` : ''}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mb-1 md:mb-4">
            Tasks you've completed or set aside. Restore anytime to bring them back to your active list.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0">
          {(!tasks || tasks.length === 0) && <EmptyState message="Nothing archived yet. Tasks you set aside will appear here." />}

          <div className="bg-[var(--color-surface-alt)] rounded-lg px-3 py-2 space-y-1.5">
            {(tasks ?? []).map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)] flex justify-between items-center opacity-70 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)] truncate">{task.title}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    Archived {task.archivedAt ? new Date(task.archivedAt).toLocaleDateString() : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); unarchive(task.id); }}
                  className="text-xs text-[var(--color-primary)] px-2 py-1 shrink-0 min-h-[36px]"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedTaskId && (
        <TaskPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </>
  );
}
