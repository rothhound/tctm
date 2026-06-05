import { useCallback, useEffect, useRef } from 'react';
import type { TaskDto } from '@tctm/shared';
import { setWatermark, useWatermark } from '../store/bucketWatermarks';

function maxCreatedAt(tasks: TaskDto[]): string | null {
  let max: string | null = null;
  for (const t of tasks) {
    if (!max || new Date(t.createdAt).getTime() > new Date(max).getTime()) max = t.createdAt;
  }
  return max;
}

/**
 * Pure: ids of tasks created strictly after the watermark. A null watermark means
 * "not yet baselined" — nothing is new until we've recorded a starting point.
 */
export function computeNew(tasks: TaskDto[], watermark: string | null): Set<string> {
  if (!watermark) return new Set();
  const wm = new Date(watermark).getTime();
  const ids = new Set<string>();
  for (const t of tasks) {
    if (new Date(t.createdAt).getTime() > wm) ids.add(t.id);
  }
  return ids;
}

/**
 * Tracks which loaded Active tasks are "new" since the user last acknowledged the inbox, using the
 * shared `active` watermark (see store/bucketWatermarks). Because useAllTasks re-renders on
 * poll/focus, this one rule covers both "arrived while away" and "arrived while watching".
 * markAllSeen() advances the watermark — which also clears the Active nav badge.
 */
export function useNewSince(tasks: TaskDto[]) {
  const watermark = useWatermark('active');
  const initialized = useRef(watermark !== null);

  // First-ever load: baseline to the newest task so the existing backlog isn't all flagged new.
  // If the badge layer already baselined it (to now), adopt that instead of re-baselining.
  useEffect(() => {
    if (initialized.current || tasks.length === 0) return;
    initialized.current = true;
    setWatermark('active', maxCreatedAt(tasks) ?? new Date().toISOString());
  }, [tasks]);

  const newTaskIds = computeNew(tasks, watermark);

  const markAllSeen = useCallback(() => {
    initialized.current = true;
    setWatermark('active', maxCreatedAt(tasks) ?? new Date().toISOString());
  }, [tasks]);

  return {
    newTaskIds,
    newCount: newTaskIds.size,
    isNew: (t: TaskDto) => newTaskIds.has(t.id),
    markAllSeen,
  };
}
