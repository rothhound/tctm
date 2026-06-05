import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// The hook only depends on these two RTK Query mutation hooks — mock them so no store/network is needed.
const subscribeMock = vi.fn(() => ({ unwrap: () => Promise.resolve({ subscribed: true }) }));
const unsubscribeMock = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
vi.mock('../store/api', () => ({
  useSubscribePushMutation: () => [subscribeMock, {}],
  useUnsubscribePushMutation: () => [unsubscribeMock, {}],
}));

import { usePushNotifications } from './usePushNotifications';

describe('usePushNotifications (unsupported environment)', () => {
  // jsdom has no serviceWorker/PushManager/Notification, and VITE_VAPID_PUBLIC_KEY is unset in tests.
  it('reports unsupported', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
  });

  it('subscribe() is a no-op that does not throw or hit the API', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => { await result.current.subscribe(); });
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
