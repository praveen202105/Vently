'use client';

import { useEffect } from 'react';
import type { ServerToClientEvents } from '@vently/shared';
import { useSocket } from './use-socket';

type Listener<E extends keyof ServerToClientEvents> = ServerToClientEvents[E];

export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: Listener<E>,
  enabled = true,
) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !enabled) return;
    // socket.io types are loose here; cast to the typed map.
    socket.on(event, handler as never);
    return () => {
      socket.off(event, handler as never);
    };
  }, [socket, event, handler, enabled]);
}
