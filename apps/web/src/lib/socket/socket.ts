'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vently/shared';
import { useAuthStore } from '@/stores/auth-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

export type VentlySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: VentlySocket | null = null;
let lastTokenUsed: string | null = null;

function buildSocket(token: string): VentlySocket {
  // Default transport order (polling → upgrade to websocket). Forcing
  // 'websocket' only fails silently on networks that block WSS upgrades
  // (some mobile carriers, corporate proxies, captive portals). Polling
  // gets us through and the client auto-upgrades once it's working.
  const s = io(SOCKET_URL, {
    auth: { token },
    transports: ['polling', 'websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    withCredentials: true,
    timeout: 20_000,
  });

  if (typeof window !== 'undefined') {
    // Surface connect failures so they show up in DevTools console + Sentry
    // (Phase 6) instead of being lost.
    s.on('connect_error', (err) => {
      // eslint-disable-next-line no-console
      console.warn('[socket] connect_error:', err.message);
    });
  }

  return s;
}

/**
 * Returns the live socket. Lazily creates one the first time it's called with
 * a valid auth token. If the token has rotated (silent refresh), tears down the
 * old socket and reconnects with the new token. Also rebuilds the socket if
 * the previous instance is dead — socket.io middleware rejections (e.g. our
 * gateway's "Profile required") leave the socket in a disconnected + inactive
 * state with NO automatic retry, so without this check a brand-new user who
 * landed on the app shell before completing /onboarding would hold onto a
 * dead socket forever.
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
    return socket;
  }

  // Socket exists but middleware rejected us (no profile yet, expired JWT, etc).
  // `disconnected && !active` means "gave up and won't retry on its own" —
  // rebuild a fresh one so the caller can connect now that conditions changed.
  if (socket.disconnected && !socket.active) {
    socket = buildSocket(token);
    lastTokenUsed = token;
  }
  return socket;
}

/**
 * Force-rebuild the socket. Call this when an upstream condition that blocks
 * gateway auth has just been resolved (notably: profile creation in
 * /onboarding). The existing socket is already dead from the prior rejection
 * and won't retry on its own, so we drop it and start fresh.
 */
export function reconnectSocket(): VentlySocket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = buildSocket(token);
  lastTokenUsed = token;
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    lastTokenUsed = null;
  }
}
