'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, X } from 'lucide-react';
import { SocketEvents, type NotificationPayload } from '@vently/shared';
import { GlassCard } from '@vently/ui';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications';
import { useSocketEvent } from '@/lib/socket/use-socket-event';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: listNotifications,
    staleTime: 30_000,
  });

  // Real-time updates: merge any newly-pushed notification into the cache.
  useSocketEvent(
    SocketEvents.NOTIFICATION_NEW,
    useCallback(
      (n: NotificationPayload) => {
        qc.setQueryData<typeof data>(['notifications'], (prev) => [
          {
            id: n.id,
            userId: '',
            type: n.type as never,
            payload: n.payload,
            readAt: null,
            createdAt: n.createdAt,
          },
          ...(prev ?? []),
        ]);
      },
      [qc],
    ),
  );

  const unread = useMemo(() => (data ?? []).filter((n) => !n.readAt).length, [data]);

  const markRead = async (id: string) => {
    await markNotificationRead(id);
    qc.setQueryData<typeof data>(['notifications'], (prev) =>
      (prev ?? []).map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    qc.setQueryData<typeof data>(['notifications'], (prev) =>
      (prev ?? []).map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-muted transition"
        aria-label={`${unread} unread notifications`}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-0 right-0 h-full w-full max-w-sm bg-background border-l border-glass-border shadow-2xl flex flex-col"
              role="dialog"
              aria-label="Notifications"
            >
              <header className="p-4 border-b border-glass-border flex items-center justify-between">
                <h2 className="text-lg">Notifications</h2>
                <div className="flex items-center gap-2">
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={markAll}
                      className="text-xs text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="p-1.5 rounded-lg hover:bg-muted"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto">
                {!data || data.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm p-8">Nothing yet.</p>
                ) : (
                  <ul className="divide-y divide-glass-border">
                    {data.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="w-full text-left p-4 flex gap-3 hover:bg-muted transition"
                        >
                          <div
                            className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                              n.readAt ? 'bg-transparent' : 'bg-primary'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{labelFor(n.type)}</p>
                            <p className="text-xs text-muted-foreground">
                              {relativeTime(n.createdAt)}
                            </p>
                          </div>
                          {!n.readAt && <Check className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function labelFor(type: string) {
  switch (type) {
    case 'FRIEND_REQUEST':
      return 'New friend request';
    case 'FRIEND_ACCEPTED':
      return 'Friend request accepted';
    case 'MATCH_FOUND':
      return 'You got matched';
    case 'MESSAGE':
      return 'New message';
    case 'MISSED_CALL':
      return 'Missed call';
    default:
      return 'Notification';
  }
}
