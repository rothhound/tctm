import { useParams, useNavigate } from 'react-router-dom';

/**
 * Derives the open task-detail panel from the URL (`/{bucket}/:taskId`) so the
 * panel is deep-linkable and shareable. `openTask` pushes a history entry so the
 * browser Back button closes the panel; `closeTask` returns to the bare list URL.
 */
export function useTaskRoute(basePath: string) {
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  return {
    selectedTaskId: taskId ?? null,
    openTask: (id: string) => navigate(`${basePath}/${id}`),
    closeTask: () => navigate(basePath),
  };
}
