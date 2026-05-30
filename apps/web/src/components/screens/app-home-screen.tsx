'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Clock3, MessageCircle, Search, UserRound, Users } from 'lucide-react';
import { GlassCard } from '@vently/ui';
import { listConversations, getUnreadCount } from '@/lib/api/conversations';
import { listFriendRequests } from '@/lib/api/friends';
import { useAuthStore } from '@/stores/auth-store';
import { formatRelative } from '@/lib/utils/time';

const QUICK_ACTIONS = [
  {
    href: '/mood',
    label: 'Start chat',
    detail: 'Pick a vibe',
    icon: MessageCircle,
    color: 'from-purple-500 to-pink-500',
  },
  {
    href: '/connections',
    label: 'Connections',
    detail: 'Friends and requests',
    icon: Users,
    color: 'from-emerald-500 to-teal-500',
  },
  {
    href: '/profile',
    label: 'Profile',
    detail: 'Mood and account',
    icon: UserRound,
    color: 'from-blue-500 to-cyan-500',
  },
] as const;

export function AppHomeScreen() {
  const profile = useAuthStore((s) => s.profile);

  const { data: unread } = useQuery({
    queryKey: ['conversations', 'unread-count'],
    queryFn: getUnreadCount,
    staleTime: 15_000,
  });
  const { data: requests } = useQuery({
    queryKey: ['friends', 'requests'],
    queryFn: listFriendRequests,
    staleTime: 30_000,
  });
  const { data: conversations, isLoading: conversationsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 20_000,
  });

  const activeConversations = (conversations ?? [])
    .filter((conversation) => !conversation.endedAt)
    .slice(0, 3);

  return (
    <div className="min-h-screen max-w-5xl mx-auto p-6 md:p-10 space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Home</p>
          <h1 className="mt-2 text-3xl md:text-4xl bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            Hi, {profile?.nickname ?? 'there'}
          </h1>
        </div>
        <Link
          href="/mood"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-primary/30 transition hover:shadow-2xl hover:shadow-primary/40"
        >
          <MessageCircle className="w-4 h-4" />
          Start chat
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Unread</p>
              <p className="mt-2 text-3xl">{unread?.count ?? 0}</p>
            </div>
            <span className="rounded-xl bg-blue-500/15 p-3 text-blue-300">
              <Bell className="w-5 h-5" />
            </span>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Requests</p>
              <p className="mt-2 text-3xl">{requests?.length ?? 0}</p>
            </div>
            <span className="rounded-xl bg-emerald-500/15 p-3 text-emerald-300">
              <Users className="w-5 h-5" />
            </span>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Open chats</p>
              <p className="mt-2 text-3xl">{activeConversations.length}</p>
            </div>
            <span className="rounded-xl bg-purple-500/15 p-3 text-purple-300">
              <MessageCircle className="w-5 h-5" />
            </span>
          </div>
        </GlassCard>
      </section>

      <section>
        <h2 className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-2xl border border-glass-border bg-glass-bg p-5 shadow-xl backdrop-blur-xl transition hover:border-primary/40"
              >
                <div
                  className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${action.color} p-3 shadow-lg`}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-base">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.detail}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wide">Recent chats</h2>
          <Link
            href="/connections"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
          >
            <Search className="w-3.5 h-3.5" />
            Browse
          </Link>
        </div>

        {conversationsLoading ? (
          <GlassCard className="p-5">
            <p className="text-sm text-muted-foreground">Loading chats...</p>
          </GlassCard>
        ) : activeConversations.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm">No open chats yet</p>
            <Link
              href="/mood"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 px-4 py-2 text-sm text-primary transition hover:bg-primary/10"
            >
              Start one
              <ArrowRight className="w-4 h-4" />
            </Link>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {activeConversations.map((conversation) => {
              const peerName = conversation.peer?.nickname ?? 'Someone';
              const lastMessage = conversation.lastMessage;
              return (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  className="block rounded-2xl border border-glass-border bg-glass-bg p-4 shadow-xl backdrop-blur-xl transition hover:border-primary/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white">
                      {peerName[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate">{peerName}</p>
                        {lastMessage && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatRelative(lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {lastMessage?.body ?? 'Open conversation'}
                      </p>
                    </div>
                    {conversation.unreadCount > 0 ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        {conversation.unreadCount}
                      </span>
                    ) : (
                      <Clock3 className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
