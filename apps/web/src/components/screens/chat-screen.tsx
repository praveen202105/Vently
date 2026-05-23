'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Phone, Send, UserPlus, Shield, Flag } from 'lucide-react';
import { toast } from 'sonner';
import {
  SocketEvents,
  type ChatMessagePayload,
  type ChatTypingPayload,
  type MessagePublic,
} from '@vently/shared';
import { GlassCard } from '@vently/ui';
import { useAuthStore } from '@/stores/auth-store';
import { useMatchStore } from '@/stores/match-store';
import { useSocket } from '@/lib/socket/use-socket';
import { useSocketEvent } from '@/lib/socket/use-socket-event';
import { listMessages, leaveConversation } from '@/lib/api/conversations';
import { sendFriendRequest } from '@/lib/api/friends';
import { blockUser } from '@/lib/api/blocks';
import { ApiError } from '@/lib/api/client';
import { ReportDialog } from '@/components/safety/report-dialog';

interface PendingMessage extends MessagePublic {
  pending?: true;
  clientId?: string;
}

const TYPING_DEBOUNCE_MS = 300;
const TYPING_TIMEOUT_MS = 3_000;

function genClientId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const socket = useSocket();
  const me = useAuthStore((s) => s.user);
  const peer = useMatchStore((s) => s.peer);

  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingEmitRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // History: fetch the first page on mount.
  const { data: page, isLoading } = useQuery({
    queryKey: ['conversations', conversationId, 'messages'],
    queryFn: () => listMessages(conversationId),
    staleTime: 0,
  });

  useEffect(() => {
    if (!page) return;
    setMessages(page.items);
  }, [page]);

  // Re-join the conversation room on socket reconnect.
  useEffect(() => {
    if (!socket || !conversationId) return;
    socket.emit(SocketEvents.CHAT_JOIN, { conversationId });
  }, [socket, conversationId]);

  // Live message handler.
  useSocketEvent(
    SocketEvents.CHAT_MESSAGE,
    useCallback(
      (msg: ChatMessagePayload) => {
        if (msg.conversationId !== conversationId) return;
        setMessages((prev) => {
          // Replace optimistic message if its clientId matches via chat:ack flow.
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, type: 'TEXT', deletedAt: null }];
        });
      },
      [conversationId],
    ),
  );

  useSocketEvent(
    SocketEvents.CHAT_ACK,
    useCallback(({ clientId, messageId }: { clientId: string; messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...m, id: messageId, pending: undefined } : m)),
      );
    }, []),
  );

  useSocketEvent(
    SocketEvents.CHAT_TYPING_STATUS,
    useCallback(
      (payload: ChatTypingPayload & { userId: string }) => {
        if (payload.conversationId !== conversationId) return;
        if (payload.userId === me?.id) return;
        setPeerTyping(payload.isTyping);
      },
      [conversationId, me?.id],
    ),
  );

  // Autoscroll on new messages + when peer starts typing.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, peerTyping]);

  const sendMessage = () => {
    const body = draft.trim();
    if (!body || !socket || !me) return;

    const clientId = genClientId();
    const optimistic: PendingMessage = {
      id: clientId,
      conversationId,
      senderId: me.id,
      body,
      type: 'TEXT',
      createdAt: new Date().toISOString(),
      deletedAt: null,
      pending: true,
      clientId,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    socket.emit(SocketEvents.CHAT_SEND, { conversationId, body, clientId });

    // Also broadcast that we're no longer typing.
    socket.emit(SocketEvents.CHAT_TYPING, { conversationId, isTyping: false });
  };

  const onInputChange = (next: string) => {
    setDraft(next);
    if (!socket) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current > TYPING_DEBOUNCE_MS) {
      lastTypingEmitRef.current = now;
      socket.emit(SocketEvents.CHAT_TYPING, { conversationId, isTyping: true });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit(SocketEvents.CHAT_TYPING, { conversationId, isTyping: false });
    }, TYPING_TIMEOUT_MS);
  };

  const leave = async () => {
    try {
      await leaveConversation(conversationId);
    } catch {
      // best-effort
    }
    router.push('/mood');
  };

  const addFriend = async () => {
    if (!peer) return;
    try {
      const result = await sendFriendRequest(peer.userId);
      if (result.kind === 'requested') toast.success('Friend request sent');
      else if (result.kind === 'accepted') toast.success("You're now friends!");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not send request';
      toast.error(msg);
    }
  };

  const block = async () => {
    if (!peer) return;
    if (!confirm(`Block ${peer.nickname}? You won't be matched with them again.`)) return;
    try {
      await blockUser(peer.userId);
      toast.success('User blocked');
      router.push('/mood');
    } catch {
      toast.error('Could not block');
    }
  };

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-glass-border bg-glass-bg backdrop-blur-xl sticky top-0 z-10">
        <button
          type="button"
          onClick={() => router.push('/connections')}
          className="p-2 rounded-lg hover:bg-muted transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white">
          {peer?.nickname[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate">{peer?.nickname ?? 'Stranger'}</p>
          <p className="text-xs text-muted-foreground">
            {peerTyping ? 'typing…' : peer ? 'online' : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={addFriend}
          disabled={!peer}
          className="p-2 rounded-lg hover:bg-primary/20 transition text-primary disabled:opacity-50"
          aria-label="Save as friend"
          title="Save as friend"
        >
          <UserPlus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => router.push(`/call/${conversationId}`)}
          className="p-2 rounded-lg hover:bg-primary/20 transition text-primary"
          aria-label="Start voice call"
        >
          <Phone className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          disabled={!peer}
          className="p-2 rounded-lg hover:bg-destructive/20 transition text-destructive disabled:opacity-50"
          aria-label="Report user"
          title="Report"
        >
          <Flag className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={block}
          disabled={!peer}
          className="p-2 rounded-lg hover:bg-destructive/20 transition text-destructive disabled:opacity-50"
          aria-label="Block user"
          title="Block"
        >
          <Shield className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('End this chat?')) void leave();
          }}
          className="text-xs px-3 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition"
        >
          End
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        aria-live="polite"
      >
        {isLoading && messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">Loading…</p>
        ) : sortedMessages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm mt-8">
            Say hi to start the conversation.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {sortedMessages.map((msg) => {
              const mine = msg.senderId === me?.id;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] md:max-w-[60%] px-4 py-2.5 rounded-2xl ${
                      mine
                        ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white rounded-br-sm'
                        : 'bg-glass-bg border border-glass-border rounded-bl-sm'
                    } ${msg.pending ? 'opacity-60' : ''}`}
                  >
                    <p className="text-sm break-words whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {peerTyping && (
          <div className="flex justify-start">
            <GlassCard className="px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                  />
                ))}
              </div>
            </GlassCard>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 border-t border-glass-border bg-glass-bg backdrop-blur-xl flex items-end gap-2 sticky bottom-0"
      >
        <textarea
          value={draft}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Type a message…"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          className="flex-1 bg-input rounded-2xl px-4 py-2.5 outline-none border border-glass-border resize-none max-h-32 focus:ring-2 focus:ring-primary/40"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.95 }}
          disabled={!draft.trim()}
          aria-label="Send"
          className="p-3 rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/30"
        >
          <Send className="w-5 h-5" />
        </motion.button>
      </form>

      {peer && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportedUserId={peer.userId}
          conversationId={conversationId}
        />
      )}
    </div>
  );
}

export default ChatScreen;
