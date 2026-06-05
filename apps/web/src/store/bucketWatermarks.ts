import { useEffect, useState } from 'react';

/**
 * Per-bucket "last acknowledged" watermarks, shared by the Active page's new-task pill and the
 * nav badges (web SideNav + mobile BottomNav). Backed by localStorage and a window event so any
 * writer (Mark all seen, opening Snoozed/Filtered) instantly updates every reader, including
 * across tabs via the native `storage` event.
 */
export type Bucket = 'active' | 'snoozed' | 'filtered';

const KEY: Record<Bucket, string> = {
  active: 'activeSeenAt',
  snoozed: 'snoozedSeenAt',
  filtered: 'filteredSeenAt',
};
const EVENT = 'tctm:watermark';

export function getWatermark(bucket: Bucket): string | null {
  try {
    return localStorage.getItem(KEY[bucket]);
  } catch {
    return null;
  }
}

export function setWatermark(bucket: Bucket, iso: string): void {
  try {
    localStorage.setItem(KEY[bucket], iso);
  } catch {
    /* localStorage unavailable — degrade gracefully */
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* no window (SSR/tests) */
  }
}

/** Advance a bucket's watermark to now — i.e. "I've seen everything here". */
export function markBucketSeen(bucket: Bucket): void {
  setWatermark(bucket, new Date().toISOString());
}

export function subscribeWatermarks(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/** Reactive read of a single bucket's watermark. */
export function useWatermark(bucket: Bucket): string | null {
  const [value, setValue] = useState<string | null>(() => getWatermark(bucket));
  useEffect(() => subscribeWatermarks(() => setValue(getWatermark(bucket))), [bucket]);
  return value;
}
