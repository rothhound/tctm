import { useState, useCallback, useRef, useEffect } from 'react';
import type { TaskDto } from '@tctm/shared';
import { api } from '../store/api';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const PAGE_SIZE = 25;

/**
 * Fetches the Active queue (keep + review, not agent-dismissed) with client-side accumulation.
 * Supports: initial load, loadMore (pagination), updateLocal (instant UI), and full refetch.
 * Agent-dismissed tasks live in the Filtered view, not here.
 */
export function useAllTasks() {
  const dispatch = useAppDispatch();
  const [accumulated, setAccumulated] = useState<TaskDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [refetchKey, setRefetchKey] = useState(0);
  const pageRef = useRef(0);
  const initialLoaded = useRef(false);

  // Refetch everything loaded so far (collapse accumulated pages back into one request).
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const maxPage = Math.max(pageRef.current, 1);
    try {
      const result = await dispatch(
        api.endpoints.getTasks.initiate({ page: 1, limit: PAGE_SIZE * maxPage }, { forceRefetch: true }),
      ).unwrap();
      setAccumulated(dedup(result.data));
      setHasMore(result.hasMore);
    } catch {
      setHasMore(false);
    }
    setIsLoading(false);
  }, [dispatch]);

  // Initial load
  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    pageRef.current = 1;
    fetchAll();
  }, [fetchAll]);

  // Re-fetch when refetchKey changes
  useEffect(() => {
    if (refetchKey === 0) return;
    fetchAll();
  }, [refetchKey, fetchAll]);

  // Listen to RTK Query mutations — debounce refetch to avoid overwriting local updates
  const apiMutations = useAppSelector((s) => s[api.reducerPath]?.mutations);
  const mutationKey = apiMutations ? Object.keys(apiMutations).length.toString() : '0';
  const refetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skipNextRefetch = useRef(false);

  useEffect(() => {
    if (!initialLoaded.current) return;
    if (skipNextRefetch.current) {
      skipNextRefetch.current = false;
      return;
    }
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      setRefetchKey((k) => k + 1);
    }, 500);
    return () => clearTimeout(refetchTimer.current);
  }, [mutationKey]);

  const refetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  // Live-inbox polling: revalidate the Active list every 30s while visible, and immediately when
  // the window regains focus / reconnects. We mirror RTK Query's refetchOnFocus/Reconnect triggers
  // (focus + visibilitychange + online) so the list stays in lockstep with the nav badge counts —
  // otherwise the badge (which has those triggers) updates while the list lags behind.
  useEffect(() => {
    const POLL_MS = 30_000;
    const refresh = () => {
      if (document.visibilityState === 'visible') setRefetchKey((k) => k + 1);
    };
    const id = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    const nextPage = pageRef.current + 1;
    setIsLoading(true);

    try {
      const result = await dispatch(
        api.endpoints.getTasks.initiate({ page: nextPage, limit: PAGE_SIZE }),
      ).unwrap();

      pageRef.current = nextPage;
      setAccumulated((prev) => dedup([...prev, ...result.data]));
      setHasMore(result.hasMore);
    } catch {
      setHasMore(false);
    }

    setIsLoading(false);
  }, [dispatch, isLoading, hasMore]);

  /** Instantly update a task in the local list (optimistic UI). */
  const updateTaskLocally = useCallback((taskId: string, updates: Partial<TaskDto>) => {
    skipNextRefetch.current = true;
    setAccumulated((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    );
  }, []);

  /** Remove a task from the local list (after archive/report/complete). */
  const removeTaskLocally = useCallback((taskId: string) => {
    setAccumulated((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  return {
    tasks: accumulated,
    isLoading,
    hasMore,
    loadMore,
    refetch,
    total: accumulated.length,
    updateTaskLocally,
    removeTaskLocally,
  };
}

function dedup(tasks: TaskDto[]): TaskDto[] {
  const seen = new Set<string>();
  return tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}
