'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSocket, type VentlySocket } from './socket';

export function useSocket(): VentlySocket | null {
  const token = useAuthStore((s) => s.accessToken);
  // Track profile presence (boolean only — we don't care about the contents).
  // A null→set transition means /onboarding just finished, which is the
  // signal that the gateway will now accept a connection. Re-pulling the
  // socket here gives consumers a fresh, healthy instance instead of the dead
  // one left over from the pre-profile rejection.
  const hasProfile = useAuthStore((s) => !!s.profile);
  const [socket, setSocket] = useState<VentlySocket | null>(() => (token ? getSocket() : null));

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }
    setSocket(getSocket());
  }, [token, hasProfile]);

  return socket;
}
