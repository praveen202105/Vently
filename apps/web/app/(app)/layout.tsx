// Authenticated app surface: chat, connections, profile, etc.
// Mobile bottom nav + desktop sidebar live here once Phase 1 wires auth.
// `middleware.ts` will gate this group on a valid session cookie.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <div className="relative min-h-screen">{children}</div>;
}
