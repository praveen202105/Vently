'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, Users, User } from 'lucide-react';

const TABS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/mood', label: 'Chat', icon: MessageCircle },
  { href: '/connections', label: 'Friends', icon: Users },
  { href: '/profile', label: 'Profile', icon: User },
];

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-glass-bg backdrop-blur-xl border-t border-glass-border"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'fill-current/20' : ''}`} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
