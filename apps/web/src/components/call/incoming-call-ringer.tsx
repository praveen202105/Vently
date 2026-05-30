'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { SocketEvents, type CallInvitePayload, type CallMode } from '@vently/shared';
import { useSocket } from '@/lib/socket/use-socket';
import { useSocketEvent } from '@/lib/socket/use-socket-event';
import { useRingtone } from '@/lib/webrtc/use-ringtone';

interface IncomingCall {
  conversationId: string;
  fromUserId: string;
  mode: CallMode;
}

export function IncomingCallRinger() {
  const router = useRouter();
  const pathname = usePathname();
  const socket = useSocket();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const reduceMotion = useReducedMotion();

  // Play the incoming-call ringtone whenever this banner is visible.
  useRingtone(!!incoming, 'incoming');

  useSocketEvent(
    SocketEvents.CALL_INVITE,
    useCallback(
      (payload: CallInvitePayload) => {
        // Ignore the invite if we're already on the call screen for it — the
        // useWebRTC hook handles signaling directly.
        if (pathname?.startsWith(`/call/${payload.conversationId}`)) return;
        setIncoming({
          conversationId: payload.conversationId,
          fromUserId: payload.fromUserId,
          mode: payload.mode === 'video' ? 'video' : 'voice',
        });
      },
      [pathname],
    ),
  );

  // Auto-clear if the caller cancels.
  useSocketEvent(
    SocketEvents.CALL_HANGUP,
    useCallback(() => setIncoming(null), []),
  );

  const accept = () => {
    if (!incoming) return;
    const id = incoming.conversationId;
    const suffix = incoming.mode === 'video' ? '?incoming=1&mode=video' : '?incoming=1';
    setIncoming(null);
    router.push(`/call/${id}${suffix}`);
  };

  const reject = () => {
    if (!incoming) return;
    // Notify the caller so their screen doesn't sit in "Calling…" until the
    // 30s timeout. The caller's onReject handler tears down the PC.
    socket?.emit(SocketEvents.CALL_REJECT, {
      conversationId: incoming.conversationId,
      fromUserId: '',
      mode: incoming.mode,
    });
    setIncoming(null);
  };

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 inset-x-4 md:left-auto md:right-4 md:w-96 z-50 bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-2xl p-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3">
            <motion.div
              animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
              transition={reduceMotion ? undefined : { duration: 1.2, repeat: Infinity }}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white"
            >
              {incoming.mode === 'video' ? (
                <Video className="w-5 h-5" />
              ) : (
                <Phone className="w-5 h-5" />
              )}
            </motion.div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm">
                {incoming.mode === 'video' ? 'Incoming video call' : 'Incoming call'}
              </p>
              <p className="text-xs text-muted-foreground">Tap to answer</p>
            </div>
            <button
              type="button"
              onClick={reject}
              aria-label="Reject"
              className="p-2.5 rounded-full bg-destructive text-destructive-foreground"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={accept}
              aria-label="Accept"
              className="p-2.5 rounded-full bg-emerald-500 text-white"
            >
              <Phone className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
