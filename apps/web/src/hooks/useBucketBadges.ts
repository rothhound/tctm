import { useEffect, useState } from 'react';
import { useGetNewCountsQuery } from '../store/api';
import { getWatermark, setWatermark, subscribeWatermarks, type Bucket } from '../store/bucketWatermarks';

const BUCKETS: Bucket[] = ['active', 'snoozed', 'filtered'];

function readAll() {
  return {
    active: getWatermark('active'),
    snoozed: getWatermark('snoozed'),
    filtered: getWatermark('filtered'),
  };
}

/**
 * "New since you last looked" counts per bucket, for the nav badges. Reads the shared watermarks,
 * baselines any that are missing to now (so historical items don't flood the badges on first run),
 * and asks the server how many items in each bucket arrived after each watermark. Refetches on
 * watermark change (Mark all seen / opening a bucket), on focus, and every 30s.
 */
export function useBucketBadges() {
  const [wm, setWm] = useState(readAll);

  useEffect(() => subscribeWatermarks(() => setWm(readAll())), []);

  // Baseline any missing watermark to now once, so the badges start at 0 and only count new arrivals.
  useEffect(() => {
    for (const b of BUCKETS) {
      if (getWatermark(b) == null) setWatermark(b, new Date().toISOString());
    }
  }, []);

  const { data } = useGetNewCountsQuery(
    {
      activeSince: wm.active ?? undefined,
      snoozedSince: wm.snoozed ?? undefined,
      filteredSince: wm.filtered ?? undefined,
    },
    { pollingInterval: 30_000 },
  );

  return {
    active: data?.active ?? 0,
    snoozed: data?.snoozed ?? 0,
    filtered: data?.filtered ?? 0,
  };
}
