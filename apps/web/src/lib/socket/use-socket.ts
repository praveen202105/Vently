'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSocket, type VentlySocket } from './socket';

export function useSocket(): VentlySocket | null {
  const token = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<VentlySocket | null>(() => (token ? getSocket() : null));

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }
    setSocket(getSocket());
  }, [token]);

  return socket;
}
