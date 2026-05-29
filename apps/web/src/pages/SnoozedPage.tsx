import { useState } from 'react';
import { useGetSnoozedTasksQuery, useClearReminderMutation } from '../store/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskPanel } from '../components/ui/TaskPanel';
import { SourceIcon } from '../components/ui/SourceIcon';

export function SnoozedPage() {
  usePageTitle('Snoozed');
  const { data: tasks, isLoading } = useGetSnoozedTasksQuery();
  const [clearReminder] = useClearReminderMutation();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="shrink-0 px-4 md:px-0">
          <h1 className="text-lg font-semibold text-[var(--color-text)] mb-1">
            Snoozed ({tasks?.length ?? 0})
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mb-1 md:mb-4">
            Tasks hidden until their reminder date. They'll reappear automatically.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0">
          {(!tasks || tasks.length === 0) && <EmptyState message="No snoozed tasks. Use 'Remind me' to snooze a task until a specific date." />}

          <div className="bg-[var(--color-surface-alt)] rounded-lg px-3 py-2 space-y-1.5">
            {(tasks ?? []).map((task) => {
              const returnsOn = task.reminderAt
                ? new Date(task.reminderAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : '';
              const daysUntil = task.reminderAt
                ? Math.ceil((new Date(task.reminderAt).getTime() - Date.now()) / 86400000)
                : 0;

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)] border-l-2 border-l-[var(--color-primary)] flex justify-between items-start cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--color-text)]">{task.title}</p>
                    {task.description && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                        {task.description.replace(/<[^>]+>/g, '')}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {task.source && <SourceIcon source={task.source} size={12} />}
                      <span className="text-[10px] text-[var(--color-primary)] font-medium">
                        Returns {returnsOn}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        ({daysUntil} {daysUntil === 1 ? 'day' : 'days'})
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); clearReminder(task.id); }}
                    className="text-xs text-[var(--color-primary)] px-2 py-1 shrink-0 min-h-[36px]"
                  >
                    Wake up
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
