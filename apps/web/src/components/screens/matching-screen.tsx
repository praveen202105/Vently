'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Sparkles, X } from 'lucide-react';
import { SocketEvents, type MatchFoundPayload } from '@vently/shared';
import { AnimatedBackground, Button, GlassCard } from '@vently/ui';
import { useAuthStore } from '@/stores/auth-store';
import { useMatchStore } from '@/stores/match-store';
import { useSocket } from '@/lib/socket/use-socket';
import { useSocketEvent } from '@/lib/socket/use-socket-event';

const TIMEOUT_MS = 60_000;
// If we can't open a socket in this long, something is wrong (no token, no
// profile, network blocking WSS+polling, etc.). Show an error instead of
// staring at "Looking for someone…" indefinitely.
const SOCKET_CONNECT_TIMEOUT_MS = 8_000;

export function MatchingScreen() {
  const router = useRouter();
  const socket = useSocket();
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hydrated);
  const { mood, status, setQueued, setMatched, setTimeout: markTimeout, reset } = useMatchStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const socketWatchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasJoinedRef = useRef(false);
  const [socketError, setSocketError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    socket?.emit(SocketEvents.MATCH_CANCEL);
    reset();
    router.push('/mood');
  }, [socket, reset, router]);

  // If auth has settled and the user has no profile, send them to /onboarding.
  // Without a profile the realtime gateway rejects the socket and the user
  // would otherwise sit on "Looking for someone…" forever.
  useEffect(() => {
    if (hydrated && !profile) router.replace('/onboarding');
  }, [hydrated, profile, router]);

  // No mood picked? go back to /mood.
  useEffect(() => {
    if (!mood) router.replace('/mood');
  }, [mood, router]);

  // Watch the socket and show an error if it never connects. This catches
  // every "stuck on matching" case: failed auth, blocked WSS+polling, missing
  // profile (caught above too but defensive), api down, etc.
  useEffect(() => {
    if (!hydrated || !profile || !mood) return;
    if (socket && socket.connected) {
      setSocketError(null);
      return;
    }
    socketWatchRef.current = setTimeout(() => {
      if (!socket || !socket.connected) {
        setSocketError(
          'Could not connect to the matchmaking server. Check your network and try again.',
        );
      }
    }, SOCKET_CONNECT_TIMEOUT_MS);
    return () => {
      if (socketWatchRef.current) clearTimeout(socketWatchRef.current);
    };
  }, [socket, hydrated, profile, mood]);

  // Emit match:join once when the socket + mood are ready.
  useEffect(() => {
    if (!socket || !mood || hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    setQueued();
    socket.emit(SocketEvents.MATCH_JOIN, { mood });

    timeoutRef.current = setTimeout(() => {
      markTimeout();
      socket.emit(SocketEvents.MATCH_CANCEL);
    }, TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [socket, mood, setQueued, markTimeout]);

  // Listen for the matchmaking server's reply.
  useSocketEvent(
    SocketEvents.MATCH_FOUND,
    useCallback(
      (payload: MatchFoundPayload) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setMatched({ conversationId: payload.conversationId, peer: payload.peer });
      },
      [setMatched],
    ),
  );

  // Navigate as soon as we transition to matched (small delay for the "found!"
  // celebration to be visible).
  useEffect(() => {
    if (status !== 'matched') return;
    const { conversationId } = useMatchStore.getState();
    if (!conversationId) return;
    const timer = setTimeout(() => router.push(`/chat/${conversationId}`), 800);
    return () => clearTimeout(timer);
  }, [status, router]);

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6">
      <AnimatedBackground variant="mood" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <motion.div
          animate={
            status === 'matched'
              ? { scale: [1, 1.1, 1] }
              : { rotate: 360 }
          }
          transition={
            status === 'matched'
              ? { duration: 0.6 }
              : { duration: 2, repeat: Infinity, ease: 'linear' }
          }
          className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center shadow-2xl"
        >
          <Sparkles className="w-14 h-14 text-white" />
        </motion.div>

        <div className="text-center max-w-sm">
          {status === 'matched' ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-3xl mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                Match found!
              </h1>
              <p className="text-muted-foreground">Taking you to the chat…</p>
            </motion.div>
          ) : socketError ? (
            <GlassCard className="p-6">
              <h2 className="text-xl mb-2">Connection problem</h2>
              <p className="text-muted-foreground text-sm mb-4">{socketError}</p>
              <Button
                variant="gradient"
                size="md"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </GlassCard>
          ) : status === 'timeout' ? (
            <GlassCard className="p-6">
              <h2 className="text-xl mb-2">No one&apos;s around right now</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Try a different mood or wait a moment and try again.
              </p>
              <Button variant="gradient" size="md" className="w-full" onClick={() => router.push('/mood')}>
                Pick another mood
              </Button>
            </GlassCard>
          ) : (
            <>
              <h1 className="text-2xl mb-1">Looking for someone…</h1>
              <p className="text-muted-foreground text-sm">
                Hang tight — usually under 10 seconds.
              </p>
            </>
          )}
        </div>

        {status !== 'matched' && (
          <Button variant="ghost" size="sm" onClick={cancel}>
            <X className="w-4 h-4" /> Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
