'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff } from 'lucide-react';
import { SocketEvents, type CallInvitePayload } from '@vently/shared';
import { useSocketEvent } from '@/lib/socket/use-socket-event';

interface IncomingCall {
  conversationId: string;
  fromUserId: string;
}

export function IncomingCallRinger() {
  const router = useRouter();
  const pathname = usePathname();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useSocketEvent(
    SocketEvents.CALL_INVITE,
    useCallback(
      (payload: CallInvitePayload) => {
        // Ignore the invite if we're already on the call screen for it — the
        // useWebRTC hook handles signaling directly.
        if (pathname?.startsWith(`/call/${payload.conversationId}`)) return;
        setIncoming({ conversationId: payload.conversationId, fromUserId: payload.fromUserId });
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
    setIncoming(null);
    router.push(`/call/${id}?incoming=1`);
  };

  const reject = () => {
    setIncoming(null);
    // useWebRTC isn't mounted here, so we don't have a socket emit — let the
    // call screen on the caller side time out, or rely on the ringer below
    // doing the explicit reject when the user lands on the screen.
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
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white">
              ?
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm">Incoming call</p>
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
