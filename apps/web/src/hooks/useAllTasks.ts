import { useState, useCallback, useRef, useEffect } from 'react';
import type { TaskDto } from '@tctm/shared';
import { api } from '../store/api';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const BUCKETS = ['inbox', 'review'] as const;
const PAGE_SIZE = 25;

/**
 * Fetches tasks from all buckets with client-side accumulation.
 * Supports: initial load, loadMore (pagination), updateLocal (instant UI), and full refetch.
 */
export function useAllTasks() {
  const dispatch = useAppDispatch();
  const [accumulated, setAccumulated] = useState<TaskDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [refetchKey, setRefetchKey] = useState(0);
  const pageRef = useRef<Record<string, number>>(
    Object.fromEntries(BUCKETS.map((b) => [b, 0])),
  );
  const bucketHasMore = useRef<Record<string, boolean>>(
    Object.fromEntries(BUCKETS.map((b) => [b, true])),
  );
  const initialLoaded = useRef(false);

  // Fetch all buckets
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const allTasks: TaskDto[] = [];

    for (const bucket of BUCKETS) {
      const maxPage = Math.max(pageRef.current[bucket] || 1, 1);
      try {
        const result = await dispatch(
          api.endpoints.getTasks.initiate(
            { bucket, page: 1, limit: PAGE_SIZE * maxPage },
            { forceRefetch: true },
          ),
        ).unwrap();
        allTasks.push(...result.data);
        bucketHasMore.current[bucket] = result.hasMore;
      } catch {
        bucketHasMore.current[bucket] = false;
      }
    }

    setAccumulated(dedup(allTasks));
    setHasMore(Object.values(bucketHasMore.current).some(Boolean));
    setIsLoading(false);
  }, [dispatch]);

  // Initial load
  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    // Reset pages for initial
    for (const b of BUCKETS) pageRef.current[b] = 1;
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

  const loadMore = useCallback(async () => {
    if (isLoading) return;

    const bucket = BUCKETS.find((b) => bucketHasMore.current[b]);
    if (!bucket) {
      setHasMore(false);
      return;
    }

    const nextPage = pageRef.current[bucket] + 1;
    setIsLoading(true);

    try {
      const result = await dispatch(
        api.endpoints.getTasks.initiate({ bucket, page: nextPage, limit: PAGE_SIZE }),
      ).unwrap();

      pageRef.current[bucket] = nextPage;
      bucketHasMore.current[bucket] = result.hasMore;

      setAccumulated((prev) => dedup([...prev, ...result.data]));
      setHasMore(Object.values(bucketHasMore.current).some(Boolean));
    } catch {
      bucketHasMore.current[bucket] = false;
      setHasMore(Object.values(bucketHasMore.current).some(Boolean));
    }

    setIsLoading(false);
  }, [dispatch, isLoading]);

  /**
   * Instantly update a task in the local list (optimistic UI).
   * Call this after a mutation to avoid waiting for refetch.
   */
  const updateTaskLocally = useCallback((taskId: string, updates: Partial<TaskDto>) => {
    skipNextRefetch.current = true;
    setAccumulated((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    );
  }, []);

  /**
   * Remove a task from the local list (after archive/report/complete).
   */
  const removeTaskLocally = useCallback((taskId: string) => {
    setAccumulated((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  return {
    tasks: accumulated,
    isLoading,
    hasMore,
    loadMore,
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
