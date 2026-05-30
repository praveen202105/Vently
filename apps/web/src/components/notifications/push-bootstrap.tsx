'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { usePush } from '@/lib/push/use-push';

/**
 * Keeps the browser's PushManager subscription mirrored to the api whenever
 * the user is already opted in. This fixes stale/missing server rows after
 * login, deploys, browser restore, or a cleared database.
 */
export function PushBootstrap() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { permission, supported, syncSubscription } = usePush();

  useEffect(() => {
    if (!accessToken || !supported || permission !== 'granted') return;
    void syncSubscription();
  }, [accessToken, permission, supported, syncSubscription]);

  return null;
}
