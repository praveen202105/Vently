'use client';

import { useEffect } from 'react';
import { SocketEvents } from '@vently/shared';
import { useSocket } from '@/lib/socket/use-socket';

function isAppVisible() {
  if (typeof document === 'undefined') return true;
  const documentVisible = document.visibilityState === 'visible';
  const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return documentVisible && focused;
}

export function PresenceVisibilityReporter() {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const sync = () => {
      socket.emit(SocketEvents.PRESENCE_VISIBILITY, { visible: isAppVisible() });
    };

    sync();
    socket.on('connect', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);

    return () => {
      socket.off('connect', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      socket.emit(SocketEvents.PRESENCE_VISIBILITY, { visible: false });
    };
  }, [socket]);

  return null;
}
