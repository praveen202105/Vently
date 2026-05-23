import { ResponsiveShell } from '@/components/shell/responsive-shell';
import { IncomingCallRinger } from '@/components/call/incoming-call-ringer';

// AuthBootstrap moved to the ROOT layout so every page (including marketing)
// hydrates the session. This layout just adds the app chrome + the in-app
// incoming-call ringer that listens for call:invite on any /chat-or-call route.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ResponsiveShell>{children}</ResponsiveShell>
      <IncomingCallRinger />
    </>
  );
}
