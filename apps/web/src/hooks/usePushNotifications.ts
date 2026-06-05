import { useCallback, useEffect, useState } from 'react';
import { useSubscribePushMutation, useUnsubscribePushMutation } from '../store/api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** VAPID public keys are base64url; the Push API wants a Uint8Array applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Manages the browser's web-push subscription against the existing /push/subscribe endpoints
 * and the service worker registered in main.tsx. Reuses the SW push/notificationclick handlers
 * in public/sw.js. `isSupported` is false when the browser lacks Push or VITE_VAPID_PUBLIC_KEY
 * is unset, so the UI can disable the control.
 */
export function usePushNotifications() {
  const browserSupported =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window;
  const isSupported = browserSupported && !!VAPID_PUBLIC_KEY;

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    browserSupported ? Notification.permission : 'denied',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subscribePush] = useSubscribePushMutation();
  const [unsubscribePush] = useUnsubscribePushMutation();

  // Reflect any existing subscription on mount.
  useEffect(() => {
    if (!browserSupported) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (!cancelled) setIsSubscribed(!!sub); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [browserSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });
      const keys = sub.toJSON().keys;
      if (keys?.p256dh && keys.auth) {
        await subscribePush({ endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }).unwrap();
        setIsSubscribed(true);
      }
    } catch {
      // permission denied mid-flow or push service error — leave unsubscribed
    } finally {
      setLoading(false);
    }
  }, [isSupported, subscribePush]);

  const unsubscribe = useCallback(async () => {
    if (!browserSupported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush({ endpoint: sub.endpoint }).unwrap().catch(() => {});
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch {
      // ignore — best effort
    } finally {
      setLoading(false);
    }
  }, [browserSupported, unsubscribePush]);

  return { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe };
}
