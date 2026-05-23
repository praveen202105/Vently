'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Home, MessageCircle, Users, User, Sparkles } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAuthStore } from '@/stores/auth-store';
import { listFriendRequests } from '@/lib/api/friends';
import { getUnreadCount } from '@/lib/api/conversations';
import { NavBadge } from './nav-badge';

const TABS = [
  { href: '/home', label: 'Home', icon: Home, badge: 'none' as const },
  { href: '/mood', label: 'Chat', icon: MessageCircle, badge: 'unread' as const },
  { href: '/connections', label: 'Friends', icon: Users, badge: 'requests' as const },
  { href: '/profile', label: 'Profile', icon: User, badge: 'none' as const },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const authed = useAuthStore((s) => !!s.accessToken);

  const { data: requests } = useQuery({
    queryKey: ['friends', 'requests'],
    queryFn: listFriendRequests,
    enabled: authed,
    staleTime: 30_000,
  });
  const { data: unread } = useQuery({
    queryKey: ['conversations', 'unread-count'],
    queryFn: getUnreadCount,
    enabled: authed,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const badgeFor = (kind: (typeof TABS)[number]['badge']) => {
    if (kind === 'requests') return requests?.length ?? 0;
    if (kind === 'unread') return unread?.count ?? 0;
    return 0;
  };

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
          const count = badgeFor(t.badge);
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
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  <NavBadge count={count} className="-top-1.5 -right-2.5" />
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
