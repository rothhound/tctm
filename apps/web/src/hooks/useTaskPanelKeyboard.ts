import { useEffect } from 'react';
import type { TaskDto } from '@tctm/shared';

export function useTaskPanelKeyboard({
  onClose, task, onArchive, onComplete, onNewSubtask,
}: {
  onClose: () => void;
  task: TaskDto | undefined;
  onArchive: () => void;
  onComplete: () => void;
  onNewSubtask: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!task) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNewSubtask();
      } else if ((e.key === 'a' || e.key === 'A') && !task.archived) {
        e.preventDefault();
        onArchive();
      } else if ((e.key === 'd' || e.key === 'D') && task.status === 'pending' && !task.archived) {
        e.preventDefault();
        onComplete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, task, onArchive, onComplete, onNewSubtask]);
}
