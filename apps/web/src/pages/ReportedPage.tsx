import type { TaskDto } from '@tctm/shared';
import { useGetReportedTasksQuery, useUnreportTaskMutation } from '../store/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTaskRoute } from '../hooks/useTaskRoute';
import { useTaskFilters } from '../hooks/useTaskFilters';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskPanel } from '../components/ui/TaskPanel';
import { TaskCard } from '../components/ui/TaskCard';

export function ReportedPage() {
  usePageTitle('Reported');
  const { data: tasks, isLoading } = useGetReportedTasksQuery();
  const [unreport] = useUnreportTaskMutation();
  const { selectedTaskId, openTask, closeTask } = useTaskRoute('/reported');

  const { filtered, filterBar, hasActiveFilters, totalCount, filteredCount } = useTaskFilters(tasks, {
    dateField: 'reportedAt',
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="shrink-0 px-4 md:px-0">
          <h1 className="text-lg font-semibold text-[var(--color-text)] mb-1">
            Reported{totalCount > 0 ? ` (${hasActiveFilters ? `${filteredCount}/${totalCount}` : totalCount})` : ''}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            Items incorrectly captured by the system. Your feedback trains the AI to get better over time.
          </p>
        </div>

        {totalCount > 0 && filterBar}

        <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0">
          {totalCount === 0 && <EmptyState message="No issues reported. Everything looks accurate so far." />}
          {totalCount > 0 && filtered.length === 0 && (
            <EmptyState message="No reported tasks match the current filters." />
          )}

          {filtered.length > 0 && (
            <div className="bg-[var(--color-surface-alt)] rounded-lg px-3 py-2 space-y-1.5">
              {filtered.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  flavor="reported"
                  isSelected={selectedTaskId === task.id}
                  onSelect={(t: TaskDto) => openTask(t.id)}
                  onAction={(id) => unreport(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedTaskId && (
        <TaskPanel taskId={selectedTaskId} onClose={closeTask} />
      )}
    </>
  );
}
