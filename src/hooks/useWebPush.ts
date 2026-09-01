import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../utils/api';

type WebPushState = {
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush(): WebPushState {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (
      typeof window === 'undefined'
      || Boolean((window as any).cloudcliDesktopNotifications)
      || !('Notification' in window)
      || !('serviceWorker' in navigator)
    ) {
      return 'unsupported';
    }
    return Notification.permission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check existing subscription on mount
  useEffect(() => {
    if (permission === 'unsupported') return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(sub !== null);
      });
    }).catch(() => {
      // SW not ready yet
    });
  }, [permission]);

  const subscribe = useCallback(async () => {
    if (permission === 'unsupported') return;
    setIsLoading(true);
    setError(null);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const keyRes = await authenticatedFetch('/api/settings/push/vapid-public-key');
      if (!keyRes.ok) {
        throw new Error(`Server rejected the VAPID key request (HTTP ${keyRes.status}).`);
      }
      const { publicKey } = await keyRes.json();

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      const subscribeRes = await authenticatedFetch('/api/settings/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });
      if (!subscribeRes.ok) {
        throw new Error(`Server rejected the subscription (HTTP ${subscribeRes.status}).`);
      }

      setIsSubscribed(true);
    } catch (err) {
      // Silent before this point: the button just reverted to "enable" with
      // no clue why (common culprits: iOS Safari outside an installed PWA,
      // OS-level notification permission blocked, no network to the backend).
      console.error('Push subscribe failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [permission]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await authenticatedFetch('/api/settings/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { permission, isSubscribed, isLoading, error, subscribe, unsubscribe };
}
