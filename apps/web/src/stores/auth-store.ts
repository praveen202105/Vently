'use client';

import { create } from 'zustand';
import type { MeResponse } from '@vently/shared';

interface AuthState {
  accessToken: string | null;
  user: MeResponse['user'] | null;
  profile: MeResponse['profile'];
  hydrated: boolean;

  setAuth: (payload: { accessToken: string; user: MeResponse['user']; profile?: MeResponse['profile'] }) => void;
  setProfile: (profile: MeResponse['profile']) => void;
  setHydrated: () => void;
  clear: () => void;
}

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

  clear: () => set({ accessToken: null, user: null, profile: null, hydrated: true }),
}));
