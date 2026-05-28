import { NextResponse, type NextRequest } from 'next/server';

// Auth-gating happens client-side via useAuthBootstrap. We can't read the
// `vently_refresh` cookie at the edge here when the api is on a different
// domain (Vercel ↔ Railway): the cookie scope is the api host, so it's
// invisible to vercel.app middleware.
//
// In an unauthenticated state, useAuthBootstrap calls /me, gets 401, clears
// the store, and the page either renders a public shell or, if the route is
// strictly private (chat/call), redirects via router.push('/login').
//
// We still ship a no-op middleware so the file stays in the build; this also
// gives us a single place to plug in CSP/edge logic later.
const APP_PREFIXES = [
  '/onboarding',
  '/mood',
  '/matching',
  '/chat',
  '/call',
  '/connections',
  '/profile',
];

export function middleware(req: NextRequest) {
  // Only do edge-side redirect when the api shares the host (single-domain
  // deploy). Otherwise let the client handle it.
  const { pathname } = req.nextUrl;
  const sameDomainCookie = req.cookies.get('vently_refresh');
  const needsAuth = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (needsAuth && !sameDomainCookie) {
    // Don't redirect — the cookie may live on the api domain and not be visible
    // here. The client will handle the redirect once /me returns 401.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)'],
};
