'use client';

import { usePathname } from 'next/navigation';
import { DesktopSidebar } from './desktop-sidebar';
import { MobileNavigation } from './mobile-navigation';

// Routes inside the (app) group that should NOT show the persistent shell —
// chat, voice call, matching, onboarding take over the full viewport.
const HIDE_SHELL_PREFIXES = ['/chat/', '/call/', '/matching', '/onboarding'];

export function ResponsiveShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideShell = HIDE_SHELL_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );

  if (hideShell) return <main id="main">{children}</main>;

  return (
    <>
      <DesktopSidebar />
      <main id="main" className="md:pl-64 pb-20 md:pb-0 min-h-screen">
        {children}
      </main>
      <MobileNavigation />
    </>
  );
}
