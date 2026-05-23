import { ResponsiveShell } from '@/components/shell/responsive-shell';
import { IncomingCallRinger } from '@/components/call/incoming-call-ringer';
import { FriendRequestToaster } from '@/components/notifications/friend-request-toaster';
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt';

// AuthBootstrap moved to the ROOT layout so every page (including marketing)
// hydrates the session. This layout adds the app chrome + global event
// listeners that need to fire on any authenticated route:
//   - IncomingCallRinger:    listens for call:invite anywhere
//   - FriendRequestToaster:  listens for friend:request anywhere
//   - PushPermissionPrompt:  one-time soft prompt for web push opt-in
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Keyboard-first skip link. Hidden until focused; first tab on any
          (app) route lands here so the nav rail/sidebar can be jumped past. */}
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <ResponsiveShell>{children}</ResponsiveShell>
      <IncomingCallRinger />
      <FriendRequestToaster />
      <PushPermissionPrompt />
    </>
  );
}
