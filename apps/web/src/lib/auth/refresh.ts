'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { getMe } from '@/lib/api/auth';

// Silent refresh strategy:
// 1. On app mount, if no access token in memory, try GET /me (which goes through
//    api() → 401 → /auth/refresh → retry). If that fails, we're anonymous.
// 2. Then schedule a periodic refresh ~30s before the JWT expiry (15min - 30s).
const REFRESH_INTERVAL_MS = (15 * 60 - 30) * 1000;

export function useAuthBootstrap() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const clear = useAuthStore((s) => s.clear);
  const hydrated = useAuthStore((s) => s.hydrated);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let timer: ReturnType<typeof setInterval> | undefined;

    const bootstrap = async () => {
      try {
        const me = await getMe();
        const token = useAuthStore.getState().accessToken;
        if (token) {
          setAuth({ accessToken: token, user: me.user, profile: me.profile });
        } else {
          // /me succeeded but token wasn't refreshed — anonymous browse.
          clear();
        }
      } catch {
        clear();
      } finally {
        timer = setInterval(async () => {
          try {
            await getMe();
          } catch {
            clear();
            router.push('/login');
          }
        }, REFRESH_INTERVAL_MS);
      }
    };

    void bootstrap();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [setAuth, clear, router]);

  return hydrated;
}
