import { AuthBootstrap } from '@/components/auth/auth-bootstrap';
import { ResponsiveShell } from '@/components/shell/responsive-shell';

// Authenticated app surface. middleware.ts redirects to /login if the refresh
// cookie is missing; AuthBootstrap then exchanges it for an access token + /me.
// ResponsiveShell renders the desktop sidebar + mobile bottom nav on most pages
// (and steps aside for chat/call/matching/onboarding full-screen surfaces).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthBootstrap>
  );
}
