'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowLeft, Phone, RotateCw, Send, UserPlus, Shield, Flag } from 'lucide-react';
import { toast } from 'sonner';
import {
  SocketEvents,
  type ChatConversationEndedPayload,
  type ChatMessagePayload,
  type ChatTypingPayload,
  type MessagePublic,
} from '@vently/shared';
import { GlassCard } from '@vently/ui';
import { useAuthStore } from '@/stores/auth-store';
import { useMatchStore } from '@/stores/match-store';
import { useSocket } from '@/lib/socket/use-socket';
import { useSocketEvent } from '@/lib/socket/use-socket-event';
import { getConversation, listMessages, leaveConversation } from '@/lib/api/conversations';
import { sendFriendRequest } from '@/lib/api/friends';
import { blockUser } from '@/lib/api/blocks';
import { ApiError } from '@/lib/api/client';
import { ReportDialog } from '@/components/safety/report-dialog';
import { MessageSkeleton } from '@/components/skeletons/message-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface PendingMessage extends MessagePublic {
  pending?: true;
  failed?: true;
  clientId?: string;
}

const TYPING_DEBOUNCE_MS = 300;
const TYPING_TIMEOUT_MS = 3_000;
// Defence in depth: if the peer disconnects mid-keystroke before the server
// can broadcast their "stopped typing" status, we still clear the indicator
// after this many ms of silence. The server now ALSO emits isTyping:false on
// disconnect, but a dropped packet/route would still strand the bubble.
const PEER_TYPING_AUTOCLEAR_MS = 5_000;
// How long to wait for chat:ack before considering a message lost. Long enough
// to absorb a Railway cold-start blip, short enough that the user gets a
// clear "tap to retry" affordance instead of staring at a greyed-out bubble.
const ACK_TIMEOUT_MS = 5_000;

function genClientId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const socket = useSocket();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const peer = useMatchStore((s) => s.peer);

  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingEmitRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Per-message ack timers. Keyed by clientId so we can clear the right one
  // when its chat:ack arrives, and surface a failed state on the matching
  // bubble when it doesn't. Stored in a ref because React state updates would
  // re-render on every keystroke during high-volume chat.
  const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Rolling timer that auto-clears the peer's typing indicator if no fresh
  // isTyping:true event has arrived in PEER_TYPING_AUTOCLEAR_MS.
  const peerTypingClearRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Sentinel at the top of the scroll container — when it enters the viewport
  // we fetch the next (older) page of messages.
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  // Used to keep the user's visual position anchored when older messages
  // are prepended at the top of the list.
  const prevScrollHeightRef = useRef(0);
  const isPrependingRef = useRef(false);

  // Conversation metadata — drives the End-vs-Back button label + the
  // "Save as friend" visibility (hidden when already FRIEND type). Fetched
  // once on mount; the type/peer don't change during a session.
  const { data: conversation } = useQuery({
    queryKey: ['conversations', conversationId, 'meta'],
    queryFn: () => getConversation(conversationId),
    staleTime: 60_000,
  });
  const isFriendConvo = conversation?.type === 'FRIEND';

  // Message history with cursor pagination. listMessages returns the OLDEST
  // 30 of the requested cursor window in chronological order (items[0] is
  // oldest, items[length-1] is newest), with nextCursor pointing to the
  // page that contains messages OLDER than items[0]. We map TanStack's
  // pages array to a flat chronological stream by reversing.
  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['conversations', conversationId, 'messages'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listMessages(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 0,
  });

  // Page-count tracker so we know whether `pages` updated because of
  // initial load (seed everything) vs fetchNextPage (only prepend the new
  // older window). The naive approach of `setMessages(flat)` on every
  // pages change would wipe optimistic + socket-received messages that
  // aren't in the server response yet.
  const lastPageCountRef = useRef(0);
  useEffect(() => {
    if (!pages) return;
    const newCount = pages.pages.length;
    const lastCount = lastPageCountRef.current;
    if (lastCount === 0) {
      // Initial load — flatten all pages chronologically into the message
      // stream. pages[0] is the newest window; reversed iteration puts the
      // oldest window first.
      const flat = [...pages.pages].reverse().flatMap((p) => p.items);
      setMessages(flat);
    } else if (newCount > lastCount) {
      // fetchNextPage just appended an older window. Prepend its items so
      // the user sees them above the current viewport, but DON'T touch the
      // tail — that's where any optimistic/pending or freshly socket-
      // delivered messages live.
      const olderPage = pages.pages[newCount - 1];
      if (olderPage) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = olderPage.items.filter((m) => !existingIds.has(m.id));
          return [...fresh, ...prev];
        });
      }
    }
    lastPageCountRef.current = newCount;
  }, [pages]);

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
        // Peer's incoming message bumps the global unread count — refresh the
        // nav badge so the user sees it light up in other tabs/sections.
        if (msg.senderId !== me?.id) {
          void qc.invalidateQueries({ queryKey: ['conversations', 'unread-count'] });
        }
      },
      [conversationId, me?.id, qc],
    ),
  );

  useSocketEvent(
    SocketEvents.CHAT_ACK,
    useCallback(({ clientId, messageId }: { clientId: string; messageId: string }) => {
      const timer = ackTimersRef.current.get(clientId);
      if (timer) {
        clearTimeout(timer);
        ackTimersRef.current.delete(clientId);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId
            ? { ...m, id: messageId, pending: undefined, failed: undefined }
            : m,
        ),
      );
    }, []),
  );

  // Clear any in-flight ack timers when the chat unmounts so they don't fire
  // against a stale setMessages closure.
  useEffect(() => {
    const timers = ackTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // If the peer blocks us mid-chat, the server emits this and we bail to
  // /connections with a toast instead of letting the user keep typing into
  // a conversation that no longer accepts messages.
  useSocketEvent(
    SocketEvents.CHAT_CONVERSATION_ENDED,
    useCallback(
      (payload: ChatConversationEndedPayload) => {
        if (payload.conversationId !== conversationId) return;
        if (payload.reason === 'blocked') {
          toast.error('This conversation has ended.');
        } else {
          toast('This conversation has ended.');
        }
        router.replace('/connections');
      },
      [conversationId, router],
    ),
  );

  useSocketEvent(
    SocketEvents.CHAT_TYPING_STATUS,
    useCallback(
      (payload: ChatTypingPayload & { userId: string }) => {
        if (payload.conversationId !== conversationId) return;
        if (payload.userId === me?.id) return;
        setPeerTyping(payload.isTyping);
        if (peerTypingClearRef.current) {
          clearTimeout(peerTypingClearRef.current);
          peerTypingClearRef.current = undefined;
        }
        if (payload.isTyping) {
          peerTypingClearRef.current = setTimeout(() => {
            setPeerTyping(false);
            peerTypingClearRef.current = undefined;
          }, PEER_TYPING_AUTOCLEAR_MS);
        }
      },
      [conversationId, me?.id],
    ),
  );

  // Clear the rolling typing timer on unmount.
  useEffect(() => {
    return () => {
      if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
    };
  }, []);

  // Load older messages when the top sentinel scrolls into view.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const scroller = scrollRef.current;
    if (!sentinel || !scroller || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Snapshot scroll height BEFORE the prepend so we can restore the
          // user's visual position after the older page lands.
          prevScrollHeightRef.current = scroller.scrollHeight;
          isPrependingRef.current = true;
          void fetchNextPage();
        }
      },
      { root: scroller, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Combined scroll management:
  //  - if older messages just prepended, keep the user anchored to what
  //    they were already reading (compensate for the new content above).
  //  - otherwise (new message at the bottom), autoscroll only if the user
  //    was already within 100px of the bottom. Don't yank a user who's
  //    deliberately scrolled back to read older messages.
  // useLayoutEffect runs synchronously after DOM mutation but BEFORE paint,
  // so the user never sees the scroll jump.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (isPrependingRef.current) {
      const diff = scroller.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) scroller.scrollTop = diff;
      isPrependingRef.current = false;
      prevScrollHeightRef.current = 0;
      return;
    }
    const nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 100;
    if (nearBottom) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, peerTyping]);

  // Mark the latest message read whenever a new peer message lands — keeps
  // the unread badge accurate without needing a per-bubble IntersectionObserver.
  // We track lastReadIdRef so a burst of N rapid messages emits CHAT_READ
  // exactly ONCE (against the newest id) instead of N times, which would
  // both waste bandwidth and cause the unread-count badge to flicker.
  const lastReadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!socket || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last || last.senderId === me?.id || last.pending) return;
    if (lastReadIdRef.current === last.id) return;
    lastReadIdRef.current = last.id;
    socket.emit(SocketEvents.CHAT_READ, { conversationId, lastMessageId: last.id });
    void qc.invalidateQueries({ queryKey: ['conversations', 'unread-count'] });
  }, [socket, messages, me?.id, conversationId, qc]);

  const armAckTimeout = useCallback((clientId: string) => {
    const existing = ackTimersRef.current.get(clientId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      ackTimersRef.current.delete(clientId);
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, pending: undefined, failed: true } : m,
        ),
      );
    }, ACK_TIMEOUT_MS);
    ackTimersRef.current.set(clientId, timer);
  }, []);

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
    armAckTimeout(clientId);

    // Also broadcast that we're no longer typing.
    socket.emit(SocketEvents.CHAT_TYPING, { conversationId, isTyping: false });
  };

  const retryMessage = useCallback(
    (clientId: string) => {
      if (!socket) return;
      const failed = messages.find((m) => m.clientId === clientId && m.failed);
      if (!failed) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, pending: true, failed: undefined } : m,
        ),
      );
      socket.emit(SocketEvents.CHAT_SEND, {
        conversationId,
        body: failed.body,
        clientId,
      });
      armAckTimeout(clientId);
    },
    [socket, messages, conversationId, armAckTimeout],
  );

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
    // FRIEND conversations are persistent — "End" on this surface just means
    // "back to the connections list". No DELETE request, no destruction; the
    // user can re-open the same thread any time from /connections. DIRECT
    // conversations get the original behaviour (DELETE + bounce to /mood).
    if (isFriendConvo) {
      router.push('/connections');
      return;
    }
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

  const confirmBlock = async () => {
    if (!peer) return;
    setBlocking(true);
    try {
      await blockUser(peer.userId);
      toast.success('User blocked');
      setBlockOpen(false);
      router.push('/mood');
    } catch {
      toast.error('Could not block');
    } finally {
      setBlocking(false);
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
        {!isFriendConvo && (
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
        )}
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
          onClick={() => setBlockOpen(true)}
          disabled={!peer}
          className="p-2 rounded-lg hover:bg-destructive/20 transition text-destructive disabled:opacity-50"
          aria-label="Block user"
          title="Block"
        >
          <Shield className="w-5 h-5" />
        </button>
        <button
          type="button"
          // For FRIEND chats the button is a navigation, not a destructive
          // action — skip the confirm dialog and just go back to /connections.
          // For DIRECT chats it still pops the existing "End this chat?"
          // confirm flow.
          onClick={() => (isFriendConvo ? void leave() : setLeaveOpen(true))}
          className={`text-xs px-3 py-1.5 rounded-lg transition ${
            isFriendConvo
              ? 'hover:bg-muted text-muted-foreground'
              : 'hover:bg-destructive/10 text-destructive'
          }`}
        >
          {isFriendConvo ? 'Back' : 'End'}
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        aria-live="polite"
      >
        {/* Sentinel + indicator for "load older" pagination. The IntersectionObserver
            attached to topSentinelRef triggers fetchNextPage whenever it enters
            the scroll viewport. The indicator gives the user a hint that more
            history exists; hidden when there's nothing older to load. */}
        <div ref={topSentinelRef} aria-hidden="true" />
        {isFetchingNextPage && (
          <p className="text-center text-xs text-muted-foreground">Loading older messages…</p>
        )}
        {isLoading && messages.length === 0 ? (
          <MessageSkeleton />
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
                  <div className="flex flex-col items-end gap-1 max-w-[80%] md:max-w-[60%]">
                    <div
                      className={`px-4 py-2.5 rounded-2xl ${
                        mine
                          ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white rounded-br-sm'
                          : 'bg-glass-bg border border-glass-border rounded-bl-sm'
                      } ${msg.pending ? 'opacity-60' : ''} ${msg.failed ? 'opacity-80 ring-1 ring-destructive/60' : ''}`}
                    >
                      <p className="text-sm break-words whitespace-pre-wrap">{msg.body}</p>
                    </div>
                    {mine && msg.failed && msg.clientId && (
                      <button
                        type="button"
                        onClick={() => retryMessage(msg.clientId!)}
                        className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition px-1"
                        aria-label="Retry sending message"
                      >
                        <AlertCircle className="w-3 h-3" />
                        <span>Failed to send.</span>
                        <RotateCw className="w-3 h-3" />
                        <span className="underline">Tap to retry</span>
                      </button>
                    )}
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

      <ConfirmDialog
        open={blockOpen}
        title={`Block ${peer?.nickname ?? 'this user'}?`}
        description="You won't be matched with them again and they can no longer message you."
        confirmLabel="Block"
        busy={blocking}
        onConfirm={confirmBlock}
        onCancel={() => setBlockOpen(false)}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="End this chat?"
        description="You can still find each other through Connections if you've added as friends."
        confirmLabel="End chat"
        onConfirm={() => {
          setLeaveOpen(false);
          void leave();
        }}
        onCancel={() => setLeaveOpen(false)}
      />
    </div>
  );
}

export default ChatScreen;
