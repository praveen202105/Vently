'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, Users, User, Sparkles } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';

const TABS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/mood', label: 'Chat', icon: MessageCircle },
  { href: '/connections', label: 'Friends', icon: Users },
  { href: '/profile', label: 'Profile', icon: User },
];

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 bg-glass-bg backdrop-blur-xl border-r border-glass-border p-6 flex-col gap-4"
      aria-label="Primary"
    >
      <div className="flex items-center justify-between mb-6">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            Vently
          </span>
        </Link>
        <NotificationBell />
      </div>

      <ul className="space-y-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  active
                    ? 'bg-primary/15 text-foreground border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
