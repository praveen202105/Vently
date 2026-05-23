'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check, MessageCircle, UserPlus, X, Users } from 'lucide-react';
import { toast } from 'sonner';
import { SocketEvents, type FriendRequestEventPayload, type FriendRespondEventPayload } from '@vently/shared';
import { GlassCard } from '@vently/ui';
import { listFriends, listFriendRequests, respondToFriendRequest } from '@/lib/api/friends';
import { useSocketEvent } from '@/lib/socket/use-socket-event';

export function ConnectionsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: listFriends,
  });
  const { data: requests } = useQuery({
    queryKey: ['friends', 'requests'],
    queryFn: listFriendRequests,
  });

  // Real-time updates: new request → toast + refresh, response → refresh.
  useSocketEvent(
    SocketEvents.FRIEND_REQUEST,
    useCallback(
      (payload: FriendRequestEventPayload) => {
        toast.message(`${payload.fromNickname || 'Someone'} wants to be friends`);
        void qc.invalidateQueries({ queryKey: ['friends', 'requests'] });
      },
      [qc],
    ),
  );
  useSocketEvent(
    SocketEvents.FRIEND_RESPOND,
    useCallback(
      (payload: FriendRespondEventPayload) => {
        if (payload.accepted) toast.success('Friend request accepted');
        void qc.invalidateQueries({ queryKey: ['friends'] });
        void qc.invalidateQueries({ queryKey: ['friends', 'requests'] });
      },
      [qc],
    ),
  );

  const respond = async (id: string, accept: boolean) => {
    try {
      await respondToFriendRequest(id, accept);
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friends', 'requests'] });
    } catch {
      toast.error('Could not respond');
    }
  };

  return (
    <div className="min-h-screen max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl mb-1 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
          Connections
        </h1>
        <p className="text-muted-foreground text-sm">
          People you&apos;ve added — reconnect anytime.
        </p>
      </header>

      {requests && requests.length > 0 && (
        <section>
          <h2 className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">
            Pending requests
          </h2>
          <div className="space-y-3">
            {requests.map((r) => (
              <GlassCard key={r.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-sm">
                    {r.from?.nickname[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{r.from?.nickname ?? 'Someone'}</p>
                    <p className="text-xs text-muted-foreground">wants to connect</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => respond(r.id, true)}
                    className="p-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition"
                    aria-label="Accept"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(r.id, false)}
                    className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition"
                    aria-label="Reject"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">
          Friends
        </h2>

        {friendsLoading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Loading…</p>
        ) : !friends || friends.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm mb-1">No connections yet</p>
            <p className="text-xs text-muted-foreground">
              Add someone as a friend during a chat to reconnect later.
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {friends.map((f, i) => (
              <motion.button
                key={f.profile?.userId ?? i}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.98 }}
                disabled={!f.conversationId}
                onClick={() => f.conversationId && router.push(`/chat/${f.conversationId}`)}
                className="w-full text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <GlassCard className="p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white">
                        {f.profile?.nickname[0]?.toUpperCase() ?? '?'}
                      </div>
                      {f.profile?.isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{f.profile?.nickname ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.profile?.isOnline ? 'online' : 'offline'}
                      </p>
                    </div>
                    <MessageCircle className="w-5 h-5 text-muted-foreground" />
                  </div>
                </GlassCard>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-xs text-muted-foreground text-center pt-4">
          <UserPlus className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          Tip: tap &quot;Save as friend&quot; inside any chat.
        </p>
      </section>
    </div>
  );
}
