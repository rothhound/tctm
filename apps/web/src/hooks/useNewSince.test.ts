import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { computeNew, useNewSince } from './useNewSince';
import type { TaskDto } from '@tctm/shared';

const OLD = '2026-05-01T00:00:00Z';
const MID = '2026-05-10T00:00:00Z';
const NEW = '2026-05-20T00:00:00Z';

function task(id: string, createdAt: string): TaskDto {
  return { id, createdAt } as unknown as TaskDto;
}

describe('computeNew', () => {
  it('returns empty when watermark is null (not yet baselined)', () => {
    expect(computeNew([task('a', NEW)], null).size).toBe(0);
  });

  it('flags only tasks created strictly after the watermark', () => {
    const ids = computeNew([task('a', OLD), task('b', MID), task('c', NEW)], MID);
    expect([...ids]).toEqual(['c']);
  });
});

describe('useNewSince', () => {
  beforeEach(() => localStorage.clear());

  it('baselines to the newest task on first load, flagging nothing new', () => {
    const { result } = renderHook(() => useNewSince([task('a', OLD), task('b', NEW)]));
    expect(result.current.newCount).toBe(0);
    expect(localStorage.getItem('activeSeenAt')).toBe(NEW);
  });

  it('flags tasks created after a pre-existing watermark', () => {
    localStorage.setItem('activeSeenAt', MID);
    const tasks = [task('a', OLD), task('b', MID), task('c', NEW)];
    const { result } = renderHook(() => useNewSince(tasks));
    expect(result.current.newCount).toBe(1);
    expect(result.current.newTaskIds.has('c')).toBe(true);
    expect(result.current.isNew(task('a', OLD))).toBe(false);
  });

  it('markAllSeen advances the watermark and clears the highlights', () => {
    localStorage.setItem('activeSeenAt', MID);
    const tasks = [task('a', OLD), task('c', NEW)];
    const { result } = renderHook(() => useNewSince(tasks));
    expect(result.current.newCount).toBe(1);

    act(() => result.current.markAllSeen());

    expect(result.current.newCount).toBe(0);
    expect(localStorage.getItem('activeSeenAt')).toBe(NEW);
  });
});
