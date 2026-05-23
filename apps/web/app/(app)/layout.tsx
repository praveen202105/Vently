import { AuthBootstrap } from '@/components/auth/auth-bootstrap';

// Authenticated app surface: chat, connections, profile, etc.
// `middleware.ts` redirects to /login if the refresh cookie is missing; the
// AuthBootstrap then exchanges the cookie for an access token + user state.
// Mobile bottom nav + desktop sidebar arrive in Phase 2 (the first phase that
// needs the shell — chat, connections, profile).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <div className="relative min-h-screen">{children}</div>
    </AuthBootstrap>
  );
}
