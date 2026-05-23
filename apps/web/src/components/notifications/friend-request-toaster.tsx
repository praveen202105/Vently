'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SocketEvents, type FriendRequestEventPayload } from '@vently/shared';
import { useMatchStore } from '@/stores/match-store';
import { useSocketEvent } from '@/lib/socket/use-socket-event';

/**
 * Global FRIEND_REQUEST listener — mounted in the (app) layout so the user
 * gets notified the instant someone sends them a request, regardless of
 * which screen they're on. Before this existed the listener lived only on
 * /connections, so a user mid-chat (or anywhere else) silently missed
 * incoming requests until they happened to navigate over.
 *
 * Suppression rules:
 *  - If the user is on the /chat/[id] with the requester right now, the
 *    in-chat banner in chat-screen handles the UX inline — skip the global
 *    toast so we don't double-notify.
 *  - The TanStack ['friends', 'requests'] query is invalidated either way
 *    so the inbox + pending count update everywhere.
 */
export function FriendRequestToaster() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const peer = useMatchStore((s) => s.peer);

  useSocketEvent(
    SocketEvents.FRIEND_REQUEST,
    useCallback(
      (payload: FriendRequestEventPayload) => {
        void qc.invalidateQueries({ queryKey: ['friends', 'requests'] });

        // If we're already chatting with the requester, the chat screen
        // shows a richer inline banner. Suppress the toast there.
        const inActiveChatWithRequester =
          pathname?.startsWith('/chat/') && peer?.userId === payload.fromUserId;
        if (inActiveChatWithRequester) return;

        toast.message(`${payload.fromNickname || 'Someone'} wants to be friends`, {
          description: 'Open Connections to accept.',
        });
      },
      [pathname, peer?.userId, qc],
    ),
  );

  return null;
}
