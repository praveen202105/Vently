'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Home, MessageCircle, Users, User } from 'lucide-react';
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

export function MobileNavigation() {
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
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-glass-bg backdrop-blur-xl border-t border-glass-border"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname.startsWith(t.href);
          const count = badgeFor(t.badge);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'fill-current/20' : ''}`} />
                  <NavBadge count={count} className="-top-1.5 -right-2.5" />
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
