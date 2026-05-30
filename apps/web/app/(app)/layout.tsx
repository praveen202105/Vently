import { ResponsiveShell } from '@/components/shell/responsive-shell';
import { IncomingCallRinger } from '@/components/call/incoming-call-ringer';
import { FriendRequestToaster } from '@/components/notifications/friend-request-toaster';
import { PresenceVisibilityReporter } from '@/components/notifications/presence-visibility-reporter';
import { PushBootstrap } from '@/components/notifications/push-bootstrap';
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt';

// AuthBootstrap moved to the ROOT layout so every page (including marketing)
// hydrates the session. This layout adds the app chrome + global event
// listeners that need to fire on any authenticated route:
//   - IncomingCallRinger:    listens for call:invite anywhere
//   - FriendRequestToaster:  listens for friend:request anywhere
//   - PresenceVisibility:    tells api whether this browser can handle live UI
//   - PushBootstrap:         keeps browser push subscription synced to api
//   - PushPermissionPrompt:  one-time soft prompt for web push opt-in
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ResponsiveShell>{children}</ResponsiveShell>
      <PresenceVisibilityReporter />
      <PushBootstrap />
      <IncomingCallRinger />
      <FriendRequestToaster />
      <PushPermissionPrompt />
    </>
  );
}
