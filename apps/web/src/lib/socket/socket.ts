'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vently/shared';
import { useAuthStore } from '@/stores/auth-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

export type VentlySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: VentlySocket | null = null;
let lastTokenUsed: string | null = null;

function buildSocket(token: string): VentlySocket {
  return io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    withCredentials: true,
  });
}

/**
 * Returns the live socket. Lazily creates one the first time it's called with
 * a valid auth token. If the token has rotated (silent refresh), tears down the
 * old socket and reconnects with the new token.
 */
export function getSocket(): VentlySocket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
      lastTokenUsed = null;
    }
    return null;
  }

  if (!socket) {
    socket = buildSocket(token);
    lastTokenUsed = token;
    return socket;
  }

  if (lastTokenUsed !== token) {
    socket.disconnect();
    socket = buildSocket(token);
    lastTokenUsed = token;
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    lastTokenUsed = null;
  }
}
