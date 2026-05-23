import { AuthBootstrap } from '@/components/auth/auth-bootstrap';
import { ResponsiveShell } from '@/components/shell/responsive-shell';
import { IncomingCallRinger } from '@/components/call/incoming-call-ringer';

// Authenticated app surface. middleware.ts redirects to /login if the refresh
// cookie is missing; AuthBootstrap then exchanges it for an access token + /me.
// ResponsiveShell renders the desktop sidebar + mobile bottom nav on most pages
// (and steps aside for chat/call/matching/onboarding full-screen surfaces).
// IncomingCallRinger sits at the top so any authenticated route can receive
// inbound call:invite events and show the accept/reject UI.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <ResponsiveShell>{children}</ResponsiveShell>
      <IncomingCallRinger />
    </AuthBootstrap>
  );
}
