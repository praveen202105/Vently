'use client';

import { create } from 'zustand';
import type { MeResponse } from '@vently/shared';

interface AuthState {
  accessToken: string | null;
  user: MeResponse['user'] | null;
  profile: MeResponse['profile'];
  hydrated: boolean;

  setAuth: (payload: {
    accessToken: string;
    user: MeResponse['user'];
    profile?: MeResponse['profile'];
  }) => void;
  setProfile: (profile: MeResponse['profile']) => void;
  setHydrated: () => void;
  clear: () => void;
}

// Cross-tab sync channel. socket.ts subscribes to this independently so it
// can tear down its module-level socket on a remote logout. BroadcastChannel
// does NOT deliver to the sending context, so posting on clear() never loops
// back to ourselves.
export const AUTH_BROADCAST_CHANNEL = 'vently-auth';
export type AuthBroadcastMessage = { type: 'logout' };

const authChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
    : null;

// Access token lives in memory only (NEVER localStorage — refresh token in
// httpOnly cookie is the persistent identity surface).
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  profile: null,
  hydrated: false,

  setAuth: ({ accessToken, user, profile }) =>
    set({ accessToken, user, profile: profile ?? null, hydrated: true }),

  setProfile: (profile) => set({ profile }),

  setHydrated: () => set({ hydrated: true }),

  clear: () => {
    set({ accessToken: null, user: null, profile: null, hydrated: true });
    // Tell every other tab on this origin to clear too. Safari < iOS 15.4
    // doesn't support BroadcastChannel — we degrade silently there (the
    // other tab will pick up the logout on its next /me refresh, ~30s).
    authChannel?.postMessage({ type: 'logout' } satisfies AuthBroadcastMessage);
  },
}));

// Inbound logout from another tab: clear local state WITHOUT re-broadcasting
// (the sender already broadcast; re-posting would have no recipients anyway
// since BroadcastChannel skips the sender, but we want to be explicit).
if (authChannel) {
  authChannel.addEventListener('message', (e: MessageEvent<AuthBroadcastMessage>) => {
    if (e.data?.type === 'logout') {
      useAuthStore.setState({
        accessToken: null,
        user: null,
        profile: null,
        hydrated: true,
      });
    }
  });
}
