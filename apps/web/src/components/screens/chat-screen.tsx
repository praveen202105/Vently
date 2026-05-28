'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowLeft, Check, Phone, Reply, RotateCw, Search, Send, Trash2, UserPlus, Shield, Flag, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  SocketEvents,
  type ChatConversationEndedPayload,
  type ChatDeleteStatusPayload,
  type ChatIcebreakerChunkPayload,
  type ChatIcebreakerDonePayload,
  type ChatMessagePayload,
  type ChatReactionPayload,
  type ChatSuggestionsPayload,
  type ChatTypingPayload,
  type FriendRequestEventPayload,
  type FriendRespondEventPayload,
  type MessagePublic,
  type MessageReactionPublic,
} from '@vently/shared';
import { GlassCard } from '@vently/ui';
import { useAuthStore } from '@/stores/auth-store';
import { useMatchStore } from '@/stores/match-store';
import { useSocket } from '@/lib/socket/use-socket';
import { useSocketEvent } from '@/lib/socket/use-socket-event';
import { getConversation, listMessages, leaveConversation, searchMessages } from '@/lib/api/conversations';
import { respondToFriendRequest, sendFriendRequest } from '@/lib/api/friends';
import { blockUser } from '@/lib/api/blocks';
import { toggleReaction as apiToggleReaction } from '@/lib/api/messages';
import { ApiError } from '@/lib/api/client';
import { ReportDialog } from '@/components/safety/report-dialog';
import { MessageSkeleton } from '@/components/skeletons/message-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReactionPicker } from '@/components/chat/reaction-picker';
import { ReactionPills } from '@/components/chat/reaction-pills';
import { IcebreakerBubble } from '@/components/chat/icebreaker-bubble';
import { SuggestionChips } from '@/components/chat/suggestion-chips';
import { TranslateButton } from '@/components/chat/translate-button';
import { ReadReceipt, type ReadReceiptStatus } from '@/components/chat/read-receipt';
import { QuoteReplyPreview } from '@/components/chat/quote-reply-preview';
import { translateMessage, type TranslateResult } from '@/lib/api/translation';
import { formatChatTime, shouldShowTimestamp, formatReunionRelative, formatDateTime } from '@/lib/utils/time';
import { useUnreadTabBadge } from '@/lib/hooks/use-unread-tab-badge';
import { checkProfanityClient } from '@/lib/utils/profanity-client';

interface PendingMessage extends MessagePublic {
  pending?: true;
  failed?: true;
  clientId?: string;
}

// Readset tracks which messageIds the peer has read, fed by CHAT_READ_STATUS events.
type ReadSet = Set<string>;

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
  const storePeer = useMatchStore((s) => s.peer);

  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // Incoming friend-request banner state — populated when the peer of THIS
  // chat sends a FRIEND_REQUEST. Drives the inline Accept/Reject UI above
  // the message list, which is more discoverable than a toast for a user
  // who's literally mid-conversation with the requester.
  const [incomingFriendRequest, setIncomingFriendRequest] = useState<
    FriendRequestEventPayload | null
  >(null);
  const [respondingToRequest, setRespondingToRequest] = useState(false);
  // Which message id (if any) is currently showing the reaction picker.
  const [pickerOpenForId, setPickerOpenForId] = useState<string | null>(null);
  // Tracks whether the local user has already sent a friend request to the
  // peer in this session. Switches the "Save as friend" button to a
  // "Request sent" affordance so the user doesn't double-tap and re-fire.
  const [requestSent, setRequestSent] = useState(false);

  // AI ice-breaker streaming state — chunks accumulate token-by-token until
  // CHAT_ICEBREAKER_DONE fires, at which point the bubble fades out and the
  // persisted CHAT_MESSAGE system message lands in the list.
  const [icebreakerChunks, setIcebreakerChunks] = useState<string[]>([]);
  const [icebreakerDone, setIcebreakerDone] = useState(false);

  // AI smart reply suggestions — populated by CHAT_SUGGESTIONS events,
  // cleared whenever the user starts typing or sends a message.
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Quote-reply: which message (if any) the composer is replying to.
  const [replyTarget, setReplyTarget] = useState<{ id: string; body: string; senderName: string } | null>(null);

  // Which messages the peer has read (keyed by messageId). Fed by CHAT_READ_STATUS.
  const [peerReadIds, setPeerReadIds] = useState<ReadSet>(new Set());

  // Toxic message pre-warning level ('clean' | 'mild' | 'severe').
  const [profanityWarning, setProfanityWarning] = useState<'clean' | 'mild' | 'severe'>('clean');

  // Context menu (delete) — which message is the target.
  const [ctxMenuMessageId, setCtxMenuMessageId] = useState<string | null>(null);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MessagePublic[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Translation state — keyed by messageId.
  // translatedMessages: holds the Groq result for each translated message.
  // translatingIds: tracks which messages are currently being fetched.
  // showTranslatedIds: tracks which messages are displaying the translation
  //   (vs the original — allows toggling back).
  const [translatedMessages, setTranslatedMessages] = useState<Map<string, TranslateResult>>(
    new Map(),
  );
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [showTranslatedIds, setShowTranslatedIds] = useState<Set<string>>(new Set());

  // Unread tab badge — only accumulates when the tab is backgrounded
  const [tabUnread, setTabUnread] = useState(0);
  const tabVisibleRef = useRef(true);

  // Apply the unread tab badge hook
  useUnreadTabBadge(tabUnread, 'Vently');

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

  const storeLastMetAt = useMatchStore((s) => s.lastMetAt);
  const lastMetAt = conversation?.lastMetAt || storeLastMetAt;
  const [showReunion, setShowReunion] = useState(true);
  const peer = storePeer || conversation?.peer;

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

  // Tell the server which conversation we're focused on, so it can suppress
  // push notifications for messages we're already reading. "Focused" means
  // BOTH the route is mounted AND the browser tab is visible — a
  // backgrounded tab should let push through (otherwise the user gets the
  // in-tab ringer/sound but no OS notification, which is the worst of
  // both worlds). visibilitychange tracks the tab state in real time.
  useEffect(() => {
    if (!socket || !conversationId) return;

    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible';

    const sync = () => {
      socket.emit(SocketEvents.PRESENCE_FOCUS, {
        conversationId: isVisible() ? conversationId : null,
      });
    };

    // Initial state on mount.
    sync();

    // Update whenever the browser tab visibility flips. Browsers also fire
    // 'blur' on the window when another app takes focus — listen to that
    // too so a different desktop app stealing focus also unblocks push.
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('blur', sync);
    window.addEventListener('focus', sync);

    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('blur', sync);
      window.removeEventListener('focus', sync);
      socket.emit(SocketEvents.PRESENCE_FOCUS, { conversationId: null });
    };
  }, [socket, conversationId]);

  // AI ice-breaker socket handlers.
  useSocketEvent(
    SocketEvents.CHAT_ICEBREAKER_CHUNK,
    useCallback(
      ({ conversationId: cid, chunk }: ChatIcebreakerChunkPayload) => {
        if (cid !== conversationId) return;
        setIcebreakerChunks((prev) => [...prev, chunk]);
      },
      [conversationId],
    ),
  );

  useSocketEvent(
    SocketEvents.CHAT_ICEBREAKER_DONE,
    useCallback(
      ({ conversationId: cid }: ChatIcebreakerDonePayload) => {
        if (cid !== conversationId) return;
        // Small delay so users can finish reading the bubble before it exits.
        setTimeout(() => setIcebreakerDone(true), 1_200);
      },
      [conversationId],
    ),
  );

  useSocketEvent(
    SocketEvents.CHAT_SUGGESTIONS,
    useCallback(
      ({ conversationId: cid, suggestions: chips, forUserId }: ChatSuggestionsPayload) => {
        if (cid !== conversationId) return;
        // Show only if addressed to this user or broadcast to the whole room.
        if (forUserId !== null && forUserId !== me?.id) return;
        setSuggestions(chips);
      },
      [conversationId, me?.id],
    ),
  );

  // Track tab visibility — reset unread count when user returns to tab
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tabVisibleRef.current = true;
        setTabUnread(0);
      } else {
        tabVisibleRef.current = false;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Live message handler.
  useSocketEvent(
    SocketEvents.CHAT_MESSAGE,
    useCallback(
      (msg: ChatMessagePayload) => {
        if (msg.conversationId !== conversationId) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg }];
        });
        if (msg.senderId !== me?.id) {
          void qc.invalidateQueries({ queryKey: ['conversations', 'unread-count'] });
        }
        // Bump the unread badge when the tab is backgrounded and it's a peer message
        if (!tabVisibleRef.current && msg.senderId !== me?.id) {
          setTabUnread((n) => n + 1);
        }
      },
      [conversationId, me?.id, qc],
    ),
  );

  // Real-time delete-for-everyone: hide the bubble body when the server broadcasts.
  useSocketEvent(
    SocketEvents.CHAT_DELETE_STATUS,
    useCallback(
      (payload: ChatDeleteStatusPayload) => {
        if (payload.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId ? { ...m, deletedAt: payload.deletedAt } : m,
          ),
        );
      },
      [conversationId],
    ),
  );

  // Track which messages the peer has read (for ✓✓ read receipt rendering).
  useSocketEvent(
    SocketEvents.CHAT_READ_STATUS,
    useCallback(
      (payload: { conversationId: string; lastMessageId: string; userId: string }) => {
        if (payload.conversationId !== conversationId) return;
        if (payload.userId === me?.id) return; // only track peer reads
        // Mark all messages up to lastMessageId as read by the peer.
        setPeerReadIds((prev) => {
          const next = new Set(prev);
          const idx = messages.findIndex((m) => m.id === payload.lastMessageId);
          if (idx !== -1) {
            messages.slice(0, idx + 1).forEach((m) => next.add(m.id));
          }
          return next;
        });
      },
      [conversationId, me?.id, messages],
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

  // Peer sent us a friend request while we're in the chat with them. Show
  // an inline Accept/Reject banner above the message list — much more
  // discoverable than waiting for the user to navigate to /connections.
  // We only react when the request is from the CURRENT chat peer; requests
  // from other users are handled by the global <FriendRequestToaster />.
  useSocketEvent(
    SocketEvents.FRIEND_REQUEST,
    useCallback(
      (payload: FriendRequestEventPayload) => {
        if (!peer || payload.fromUserId !== peer.userId) return;
        setIncomingFriendRequest(payload);
      },
      [peer],
    ),
  );

  // Peer accepted (or rejected) a friend request we sent them. On accept
  // the server promotes the conversation type to FRIEND — refresh the meta
  // query so the End button flips to "Back" and the Save-as-friend button
  // disappears without a manual reload.
  useSocketEvent(
    SocketEvents.FRIEND_RESPOND,
    useCallback(
      (payload: FriendRespondEventPayload) => {
        if (!peer || payload.byUserId !== peer.userId) return;
        if (payload.accepted) {
          toast.success("You're now friends!");
          setRequestSent(false);
          void qc.invalidateQueries({ queryKey: ['conversations', conversationId, 'meta'] });
          void qc.invalidateQueries({ queryKey: ['friends'] });
        } else {
          // Don't toast a rejection — silently hide the "request sent"
          // affordance so the user can try again later if they want.
          setRequestSent(false);
        }
      },
      [peer, qc, conversationId],
    ),
  );

  const acceptIncomingRequest = useCallback(async () => {
    if (!incomingFriendRequest) return;
    setRespondingToRequest(true);
    try {
      await respondToFriendRequest(incomingFriendRequest.requestId, true);
      toast.success("You're now friends!");
      setIncomingFriendRequest(null);
      // Conversation type just flipped to FRIEND on the server — refresh
      // meta so the End button becomes "Back" and the Save button hides.
      void qc.invalidateQueries({ queryKey: ['conversations', conversationId, 'meta'] });
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friends', 'requests'] });
    } catch {
      toast.error('Could not accept the request');
    } finally {
      setRespondingToRequest(false);
    }
  }, [incomingFriendRequest, qc, conversationId]);

  // Apply a reaction add/remove to the local messages state. Used by both
  // the optimistic local toggle AND the inbound CHAT_REACTION broadcast.
  // De-duplicates by (emoji, userId) so a server broadcast of an action the
  // local user already applied optimistically doesn't create a duplicate.
  const applyReactionChange = useCallback(
    (payload: ChatReactionPayload) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== payload.messageId) return m;
          const existing: MessageReactionPublic[] = m.reactions ?? [];
          if (payload.action === 'add') {
            const dup = existing.some(
              (r) => r.userId === payload.userId && r.emoji === payload.emoji,
            );
            if (dup) return m;
            return { ...m, reactions: [...existing, { emoji: payload.emoji, userId: payload.userId }] };
          }
          return {
            ...m,
            reactions: existing.filter(
              (r) => !(r.userId === payload.userId && r.emoji === payload.emoji),
            ),
          };
        }),
      );
    },
    [],
  );

  // Inbound reaction events from any participant. The server broadcasts to
  // the entire conversation room (including the originator) so all open
  // clients converge.
  useSocketEvent(
    SocketEvents.CHAT_REACTION,
    useCallback(
      (payload: ChatReactionPayload) => {
        if (payload.conversationId !== conversationId) return;
        applyReactionChange(payload);
      },
      [conversationId, applyReactionChange],
    ),
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!me) return;
      const target = messages.find((m) => m.id === messageId);
      if (!target) return;
      const alreadyMine = (target.reactions ?? []).some(
        (r) => r.userId === me.id && r.emoji === emoji,
      );
      const optimisticAction: 'add' | 'remove' = alreadyMine ? 'remove' : 'add';
      // Optimistic apply for snappiness — server will broadcast the real
      // action and our dedup keeps the state consistent either way.
      applyReactionChange({
        messageId,
        conversationId,
        userId: me.id,
        emoji,
        action: optimisticAction,
      });
      try {
        await apiToggleReaction(messageId, emoji);
      } catch (err) {
        // Roll back the optimistic change.
        applyReactionChange({
          messageId,
          conversationId,
          userId: me.id,
          emoji,
          action: optimisticAction === 'add' ? 'remove' : 'add',
        });
        const msg = err instanceof ApiError ? err.message : 'Could not react';
        toast.error(msg);
      }
    },
    [me, messages, conversationId, applyReactionChange],
  );

  const rejectIncomingRequest = useCallback(async () => {
    if (!incomingFriendRequest) return;
    setRespondingToRequest(true);
    try {
      await respondToFriendRequest(incomingFriendRequest.requestId, false);
      setIncomingFriendRequest(null);
      void qc.invalidateQueries({ queryKey: ['friends', 'requests'] });
    } catch {
      toast.error('Could not reject the request');
    } finally {
      setRespondingToRequest(false);
    }
  }, [incomingFriendRequest, qc]);

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

  const sendMessage = (overrideBody?: string) => {
    const body = (overrideBody ?? draft).trim();
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
      reactions: [],
      pending: true,
      clientId,
      replyToMessageId: replyTarget?.id ?? null,
      replyToBody: replyTarget?.body ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    if (!overrideBody) setDraft('');
    setSuggestions([]);
    setProfanityWarning('clean');
    const currentReplyTarget = replyTarget;
    setReplyTarget(null);
    socket.emit(SocketEvents.CHAT_SEND, {
      conversationId,
      body,
      clientId,
      replyToMessageId: currentReplyTarget?.id,
    });
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
    if (next && suggestions.length > 0) setSuggestions([]);
    // Real-time profanity pre-warning
    setProfanityWarning(checkProfanityClient(next));
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

  /** Delete a sent message for everyone. Only own messages. */
  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!socket) return;
      setCtxMenuMessageId(null);
      socket.emit(SocketEvents.CHAT_DELETE, { messageId, conversationId });
    },
    [socket, conversationId],
  );

  /** Derive ✓✓ read receipt status for a sent message. */
  const getReadReceiptStatus = useCallback(
    (msg: PendingMessage): ReadReceiptStatus => {
      if (msg.pending) return 'pending';
      if (msg.failed) return 'sent'; // show grey single tick on fail
      if (peerReadIds.has(msg.id)) return 'read';
      return 'sent';
    },
    [peerReadIds],
  );

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

  const onSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await searchMessages(conversationId, q.trim());
        setSearchResults(res.items);
      } catch {
        // silent
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addFriend = async () => {
    if (!peer || requestSent) return;
    try {
      const result = await sendFriendRequest(peer.userId);
      if (result.kind === 'requested') {
        toast.success('Friend request sent');
        setRequestSent(true);
      } else if (result.kind === 'accepted') {
        toast.success("You're now friends!");
        // Auto-accept case (peer had a pending request to us already) —
        // conversation type just promoted, refresh meta.
        void qc.invalidateQueries({ queryKey: ['conversations', conversationId, 'meta'] });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not send request';
      toast.error(msg);
    }
  };

  // Detect the viewer's browser locale (e.g. "en", "hi", "es-MX").
  // We pass the full BCP-47 tag to the API; Groq handles regional variants.
  const viewerLocale =
    typeof navigator !== 'undefined' ? navigator.language : 'en';

  const handleTranslate = useCallback(
    async (messageId: string) => {
      if (translatingIds.has(messageId) || translatedMessages.has(messageId)) {
        // Already fetched — just show it.
        setShowTranslatedIds((prev) => new Set([...prev, messageId]));
        return;
      }
      setTranslatingIds((prev) => new Set([...prev, messageId]));
      try {
        const result = await translateMessage(conversationId, messageId, viewerLocale);
        setTranslatedMessages((prev) => new Map([...prev, [messageId, result]]));
        setShowTranslatedIds((prev) => new Set([...prev, messageId]));
        // Replace suggestion chips with localized ones if available.
        if (result.chips.length > 0) setSuggestions(result.chips);
      } catch {
        toast.error('Could not translate message');
      } finally {
        setTranslatingIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    },
    [conversationId, translatingIds, translatedMessages, viewerLocale],
  );

  const handleToggleTranslation = useCallback((messageId: string) => {
    setShowTranslatedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

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
    <div className="min-h-screen flex flex-col relative">
      <header className="flex items-center gap-3 p-4 border-b border-glass-border bg-glass-bg backdrop-blur-xl sticky top-0 z-10">
        <button
          type="button"
          onClick={() => searchOpen ? closeSearch() : router.push('/connections')}
          className="p-2 rounded-lg hover:bg-muted transition"
          aria-label={searchOpen ? 'Close search' : 'Back'}
        >
          {searchOpen ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>

        {searchOpen ? (
          <input
            id="chat-search-input"
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 bg-input rounded-xl px-4 py-2 outline-none border border-glass-border focus:ring-2 focus:ring-primary/40 text-sm"
          />
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white">
              {peer?.nickname[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate">{peer?.nickname ?? 'Stranger'}</p>
              <p className="text-xs text-muted-foreground">
                {peerTyping
                  ? `${isFriendConvo ? (peer?.nickname ?? 'Peer') : 'Peer'} is typing…`
                  : peer ? 'online' : '—'}
              </p>
            </div>
          </>
        )}

        {!searchOpen && !isFriendConvo && (
          <button
            type="button"
            onClick={addFriend}
            disabled={!peer || requestSent}
            className={`p-2 rounded-lg transition disabled:opacity-50 ${
              requestSent
                ? 'text-muted-foreground'
                : 'hover:bg-primary/20 text-primary'
            }`}
            aria-label={requestSent ? 'Friend request sent' : 'Save as friend'}
            title={requestSent ? 'Friend request sent' : 'Save as friend'}
          >
            {requestSent ? <Check className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
          </button>
        )}

        {!searchOpen && (
          <>
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
              onClick={() => (isFriendConvo ? void leave() : setLeaveOpen(true))}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${
                isFriendConvo
                  ? 'hover:bg-muted text-muted-foreground'
                  : 'hover:bg-destructive/10 text-destructive'
              }`}
            >
              {isFriendConvo ? 'Back' : 'End'}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
          className="p-2 rounded-lg hover:bg-primary/20 transition text-primary"
          aria-label="Search messages"
          title="Search"
        >
          <Search className="w-5 h-5" />
        </button>
      </header>

      {/* Search results overlay */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-[65px] left-0 right-0 bottom-0 z-20 bg-background/95 backdrop-blur-xl overflow-y-auto"
          >
            {isSearching ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-muted-foreground">Searching…</p>
              </div>
            ) : searchQuery.trim().length < 2 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Search className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Type at least 2 characters to search</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <p className="text-sm text-muted-foreground">No messages found for &ldquo;{searchQuery}&rdquo;</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                </p>
                {searchResults.map((msg) => {
                  const mine = msg.senderId === me?.id;
                  const qi = msg.body.toLowerCase().indexOf(searchQuery.toLowerCase());
                  const highlighted = qi >= 0 ? (
                    <span>
                      {msg.body.slice(0, qi)}
                      <mark className="bg-yellow-400/30 text-foreground rounded px-0.5">
                        {msg.body.slice(qi, qi + searchQuery.length)}
                      </mark>
                      {msg.body.slice(qi + searchQuery.length)}
                    </span>
                  ) : msg.body;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] ${
                        mine
                          ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white rounded-br-sm'
                          : 'bg-glass-bg border border-glass-border rounded-bl-sm'
                      }`}>
                        <p className="text-sm break-words">{highlighted}</p>
                        <p className="text-[10px] mt-1 opacity-60">{new Date(msg.createdAt).toLocaleString()}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reunion Banner */}
      <AnimatePresence>
        {lastMetAt && showReunion && peer && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="border-b border-glass-border bg-glass-bg/50 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 max-w-xl mx-auto">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/20">
                  <Sparkles className="w-4 h-4 animate-pulse text-purple-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground text-left">
                    You two met before!
                  </p>
                  <p className="text-xs text-muted-foreground text-left">
                    You chatted {formatReunionRelative(lastMetAt)} · {formatDateTime(lastMetAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReunion(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 transition shrink-0"
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-chat friend-request banner. Fires when the active peer sends
          a friend request — much more discoverable than waiting for the
          user to navigate to /connections. Pulses gently to draw the eye. */}
      <AnimatePresence>
        {incomingFriendRequest && peer && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="border-b border-glass-border bg-glass-bg backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-sm shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  <span className="font-medium">{peer.nickname}</span> wants to be friends
                </p>
                <p className="text-xs text-muted-foreground">
                  Accept to keep this chat in Connections forever.
                </p>
              </div>
              <button
                type="button"
                onClick={rejectIncomingRequest}
                disabled={respondingToRequest}
                aria-label="Reject friend request"
                className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={acceptIncomingRequest}
                disabled={respondingToRequest}
                aria-label="Accept friend request"
                className="p-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        data-testid="message-list"
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
          <>
          <IcebreakerBubble chunks={icebreakerChunks} done={icebreakerDone} />

          <AnimatePresence initial={false}>
            {sortedMessages.map((msg, idx) => {
              const isSystem = msg.type === 'SYSTEM';
              const mine = !isSystem && msg.senderId === me?.id;
              const prev = idx > 0 ? sortedMessages[idx - 1] : null;
              const showTimestamp = shouldShowTimestamp(
                prev?.createdAt ?? null,
                msg.createdAt,
                prev?.senderId ?? null,
                msg.senderId,
              );

              // System messages (ice-breaker, "You're now friends!") render
              // centred and muted — they're not from either participant.
              if (isSystem) {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center my-1"
                  >
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-full px-3 py-1 text-center max-w-xs">
                      {msg.body}
                    </p>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col gap-1 max-w-[80%] md:max-w-[60%] ${mine ? 'items-end' : 'items-start'}`}>
                    {/* Cluster-aware timestamp above the first bubble of a
                        sender run (or after a >5min gap). */}
                    {showTimestamp && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        {formatChatTime(msg.createdAt)}
                      </span>
                    )}
                    <div className="relative group">
                      <div
                        onMouseEnter={() =>
                          window.matchMedia('(hover: hover)').matches && setPickerOpenForId(msg.id)
                        }
                        onMouseLeave={() =>
                          window.matchMedia('(hover: hover)').matches && setPickerOpenForId(null)
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setPickerOpenForId((id) => (id === msg.id ? null : msg.id));
                          if (!msg.pending && !msg.failed && !msg.deletedAt) {
                            setCtxMenuMessageId((id) => (id === msg.id ? null : msg.id));
                          }
                        }}
                        className={`px-4 py-2.5 rounded-2xl ${
                          mine
                            ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white rounded-br-sm'
                            : 'bg-glass-bg border border-glass-border rounded-bl-sm'
                        } ${msg.pending ? 'opacity-60' : ''} ${msg.failed ? 'opacity-80 ring-1 ring-destructive/60' : ''}`}
                      >
                        {/* Quote-reply preview inside the bubble */}
                        {msg.replyToBody && (
                          <QuoteReplyPreview
                            replyToBody={msg.replyToBody}
                            replyToSenderName={
                              msg.replyToMessageId && messages.find((m) => m.id === msg.replyToMessageId)?.senderId === me?.id
                                ? 'You'
                                : (peer?.nickname ?? 'Peer')
                            }
                            mine={mine}
                          />
                        )}
                        {msg.deletedAt ? (
                          <p className="text-sm italic opacity-50">This message was deleted</p>
                        ) : (
                          <p
                            className="text-sm break-words whitespace-pre-wrap"
                            data-testid={showTranslatedIds.has(msg.id) ? 'translated-text' : undefined}
                          >
                            {showTranslatedIds.has(msg.id)
                              ? (translatedMessages.get(msg.id)?.translated ?? msg.body)
                              : msg.body}
                          </p>
                        )}
                      </div>
                      {/* Context menu — reply & delete for everyone */}
                      <AnimatePresence>
                        {ctxMenuMessageId === msg.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -4 }}
                            className={`absolute ${mine ? 'right-0' : 'left-0'} top-full mt-1 z-30 rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-xl shadow-xl overflow-hidden min-w-[160px]`}
                          >
                            <button
                              type="button"
                              onClick={() => setReplyTarget({ id: msg.id, body: msg.body, senderName: mine ? 'You' : (peer?.nickname ?? 'Peer') })}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted/40 transition text-left"
                            >
                              <Reply className="w-3.5 h-3.5" />
                              Reply
                            </button>
                            {mine && (
                              <button
                                type="button"
                                onClick={() => deleteMessage(msg.id)}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition text-left"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete for everyone
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <ReactionPicker
                        open={pickerOpenForId === msg.id && !msg.pending && !msg.failed}
                        onPick={(emoji) => void toggleReaction(msg.id, emoji)}
                        onClose={() => setPickerOpenForId(null)}
                      />
                    </div>
                    {/* Translate button — only for peer messages that are persisted. */}
                    {!mine && !msg.pending && !msg.failed && (
                      <TranslateButton
                        loading={translatingIds.has(msg.id)}
                        showingTranslation={showTranslatedIds.has(msg.id)}
                        detectedLanguage={translatedMessages.get(msg.id)?.detectedLanguage ?? null}
                        onTranslate={() => void handleTranslate(msg.id)}
                        onToggle={() => handleToggleTranslation(msg.id)}
                      />
                    )}
                    {/* Pills below the bubble — clickable to toggle. */}
                    <ReactionPills
                      reactions={msg.reactions ?? []}
                      meId={me?.id}
                      mine={mine}
                      onToggle={(emoji) => void toggleReaction(msg.id, emoji)}
                    />
                    {/* Read receipt ticks — only on own messages */}
                    {mine && !msg.pending && !msg.failed && !msg.deletedAt && (
                      <div className="flex justify-end pr-1">
                        <ReadReceipt status={getReadReceiptStatus(msg)} />
                      </div>
                    )}
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
          </>
        )}

        {peerTyping && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex justify-start"
          >
            <GlassCard className="px-4 py-2.5">
              <div className="flex flex-col gap-1">
                {peer?.nickname && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {peer.nickname}
                  </span>
                )}
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
              </div>
            </GlassCard>
          </motion.div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-glass-border bg-glass-bg backdrop-blur-xl">
        {/* Toxic message pre-warning banner */}
        <AnimatePresence>
          {profanityWarning !== 'clean' && draft.trim() && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-2 px-4 py-2 text-xs ${
                profanityWarning === 'severe'
                  ? 'bg-destructive/15 text-destructive border-t border-destructive/20'
                  : 'bg-amber-500/10 text-amber-400 border-t border-amber-500/20'
              }`}
            >
              <span className="text-base">{profanityWarning === 'severe' ? '🚫' : '⚠️'}</span>
              <span>
                {profanityWarning === 'severe'
                  ? 'This message violates our content policy and will be blocked.'
                  : 'This message may be flagged by our moderation system.'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Quote-reply composer preview */}
        {replyTarget && (
          <QuoteReplyPreview
            replyToBody={replyTarget.body}
            replyToSenderName={replyTarget.senderName}
            onCancel={() => setReplyTarget(null)}
          />
        )}
        <SuggestionChips
          suggestions={suggestions}
          onSelect={(text) => sendMessage(text)}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="p-3 flex items-end gap-2"
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
      </div>

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
