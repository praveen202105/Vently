import { NextResponse, type NextRequest } from 'next/server';

// Routes under the `(app)` group require auth. The login/register flow
// (Phase 1) will set a `vently_refresh` httpOnly cookie; until then this
// middleware is a no-op that documents the intent.
const APP_PREFIXES = ['/onboarding', '/mood', '/matching', '/chat', '/call', '/connections', '/profile'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const refresh = req.cookies.get('vently_refresh');
  if (!refresh) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
