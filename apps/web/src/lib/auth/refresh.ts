'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { getMe } from '@/lib/api/auth';

// Silent refresh + auth gate. Middleware can't read the api-domain cookie when
// web and api are on different hosts (Vercel ↔ Railway), so this hook is the
// authoritative auth check on the client:
//   1. On mount of any (app) route, call /me. The api() wrapper auto-handles
//      401 → /auth/refresh → retry, so a valid refresh cookie hydrates the store.
//   2. If /me ultimately fails (no refresh / refresh rejected), push /login
//      with ?next so we come back after sign-in.
//   3. Once authenticated, refresh again ~30s before the 15min JWT expiry.
const REFRESH_INTERVAL_MS = (15 * 60 - 30) * 1000;

// Public routes inside the matcher that should NOT bounce to /login on a
// failed /me — login/register live in the (auth) group and the (marketing)
// pages stay readable anonymously.
const PUBLIC_PREFIXES = ['/', '/welcome', '/home', '/login', '/register', '/forgot-password'];

// Routes inside the (app) group that do NOT require a Profile to be present.
// /onboarding is itself the place where you create the profile. /profile lets
// you edit it. The rest (mood, matching, chat, call, connections) ALL need a
// profile — without one the socket gateway rejects the connection so the user
// would otherwise sit stuck on "Looking for someone…" forever.
const NO_PROFILE_REQUIRED_PREFIXES = ['/onboarding', '/profile'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`),
  );
}

function requiresProfile(pathname: string) {
  if (isPublic(pathname)) return false;
  return !NO_PROFILE_REQUIRED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function useAuthBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
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
          // If the user is authenticated but has NO profile yet, force them
          // into onboarding. Without this they can land on /matching, the
          // socket fails auth with "Profile required", and they sit stuck
          // forever — exactly the bug the api logs surfaced.
          if (!me.profile && pathname && requiresProfile(pathname)) {
            router.replace('/onboarding');
          }
        } else {
          clear();
        }
      } catch {
        clear();
        // Only redirect on protected routes — bouncing /welcome users to /login
        // would be hostile.
        if (pathname && !isPublic(pathname)) {
          const next = encodeURIComponent(pathname);
          router.replace(`/login?next=${next}`);
        }
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
  }, [setAuth, clear, router, pathname]);

  return hydrated;
}
