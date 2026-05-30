/**
 * Socket.io event contracts shared by apps/api and apps/web.
 * Adding an event? Add the constant + payload type here so both sides stay in sync.
 */

import type { Gender, MessageType, MoodIntent } from './types/enums.js';

export const SocketEvents = {
  // Presence
  PRESENCE_HEARTBEAT: 'presence:heartbeat',
  PRESENCE_ONLINE: 'presence:online',
  PRESENCE_OFFLINE: 'presence:offline',

  // Matchmaking
  MATCH_JOIN: 'match:join',
  MATCH_CANCEL: 'match:cancel',
  MATCH_FOUND: 'match:found',
  MATCH_TIMEOUT: 'match:timeout',

  // Chat
  CHAT_JOIN: 'chat:join',
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  CHAT_ACK: 'chat:ack',
  CHAT_TYPING: 'chat:typing',
  CHAT_TYPING_STATUS: 'chat:typing-status',
  CHAT_READ: 'chat:read',
  CHAT_READ_STATUS: 'chat:read-status',
  CHAT_CONVERSATION_ENDED: 'chat:conversation-ended',
  CHAT_REACTION: 'chat:reaction',
  CHAT_DELETE: 'chat:delete',
  CHAT_DELETE_STATUS: 'chat:delete-status',
  // Match queue stats for ETA estimator
  MATCH_QUEUE_STATS: 'match:queue-stats',

  // Presence (focus suppression for push)
  PRESENCE_FOCUS: 'presence:focus',
  PRESENCE_VISIBILITY: 'presence:visibility',

  // Friends
  FRIEND_REQUEST: 'friend:request',
  FRIEND_RESPOND: 'friend:respond',
  FRIEND_ONLINE: 'friend:online',
  FRIEND_OFFLINE: 'friend:offline',

  // Calls (WebRTC signaling)
  CALL_INVITE: 'call:invite',
  CALL_ACCEPT: 'call:accept',
  CALL_REJECT: 'call:reject',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_MEDIA_STATE: 'call:media-state',
  CALL_HANGUP: 'call:hangup',

  // Notifications
  NOTIFICATION_NEW: 'notification:new',

  // AI ice-breaker (streaming)
  CHAT_ICEBREAKER_CHUNK: 'chat:icebreaker:chunk',
  CHAT_ICEBREAKER_DONE: 'chat:icebreaker:done',

  // AI smart reply suggestions
  CHAT_SUGGESTIONS: 'chat:suggestions',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

// ─── Payload types ─────────────────────────────────────────────────────────

export interface MatchJoinPayload {
  mood: MoodIntent;
  preferredGender?: Gender;
}

export interface MatchFoundPayload {
  conversationId: string;
  peer: {
    userId: string;
    nickname: string;
    gender: Gender;
    avatarSeed: string;
  };
  // The mood both users queued under. Identical for both sides of the pair
  // because the matchmaking queue is keyed by (mood, gender). The client
  // uses this to branch routing — VOICE_ONLY goes straight to /call/[id],
  // every other mood goes to /chat/[id].
  mood: MoodIntent;
  lastMetAt?: string | null;
  // Set true when the matchmaking timeout fired and the user was paired
  // with an AI fallback peer instead of a real human. Frontend uses this
  // (and the `ai_` prefix on peer.userId) to disable voice/friend
  // affordances. Omitted/false for real matches.
  isAIChat?: boolean;
}

export interface ChatSendPayload {
  conversationId: string;
  body: string;
  clientId: string;
  /** If set, this message is a reply to the given messageId (quote-reply). */
  replyToMessageId?: string;
}

export interface ChatMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: MessageType;
  createdAt: string;
  deletedAt: string | null;
  reactions: { emoji: string; userId: string }[];
  /** ISO string of the latest readAt receipt for this message, or null. */
  readReceiptAt?: string | null;
  /** messageId this message is replying to (quote-reply), if any. */
  replyToMessageId?: string | null;
  /** Snapshot of the quoted message body (populated by server on send). */
  replyToBody?: string | null;
}

export interface ChatAckPayload {
  clientId: string;
  messageId: string;
}

export interface ChatTypingPayload {
  conversationId: string;
  isTyping: boolean;
}

export interface ChatReadPayload {
  conversationId: string;
  lastMessageId: string;
}

export interface ChatConversationEndedPayload {
  conversationId: string;
  reason: 'blocked' | 'left' | 'system';
}

export interface ChatDeletePayload {
  /** The message id to soft-delete. */
  messageId: string;
  conversationId: string;
}

export interface ChatDeleteStatusPayload {
  messageId: string;
  conversationId: string;
  deletedAt: string;
}

export interface MatchQueueStatsPayload {
  mood: string;
  queueLength: number;
  estimatedWaitSec: number;
}

export interface ChatReactionPayload {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
  action: 'add' | 'remove';
}

// Sent by the client to tell the server which conversation (if any) the user
// is currently looking at. The server uses this to suppress redundant push
// notifications for the conversation the user is actively reading.
export interface PresenceFocusPayload {
  conversationId: string | null;
}

// Sent by every app tab when its browser visibility/focus state changes.
// Backend uses this to avoid sending OS push while the app is visibly active.
export interface PresenceVisibilityPayload {
  visible: boolean;
}

export interface FriendRequestEventPayload {
  requestId: string;
  fromUserId: string;
  fromNickname: string;
}

export interface FriendRespondEventPayload {
  requestId: string;
  accepted: boolean;
  byUserId: string;
}

export type CallMode = 'voice' | 'video';

export interface CallInvitePayload {
  conversationId: string;
  fromUserId: string;
  mode?: CallMode;
}

export interface CallSdpPayload {
  conversationId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallIceCandidatePayload {
  conversationId: string;
  candidate: RTCIceCandidateInit;
}

export interface CallHangupPayload {
  conversationId: string;
  reason?: string;
}

export interface CallMediaStatePayload {
  conversationId: string;
  fromUserId?: string;
  cameraOn?: boolean;
  muted?: boolean;
}

export interface ChatIcebreakerChunkPayload {
  conversationId: string;
  chunk: string;
}

export interface ChatIcebreakerDonePayload {
  conversationId: string;
}

export interface ChatSuggestionsPayload {
  conversationId: string;
  suggestions: string[];
  // null = show to all room members (used after ice-breaker);
  // a userId = show only to that recipient (used after a peer message).
  forUserId: string | null;
}

export interface NotificationPayload {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ─── Typed event maps ──────────────────────────────────────────────────────

export interface ClientToServerEvents {
  [SocketEvents.PRESENCE_HEARTBEAT]: () => void;
  [SocketEvents.PRESENCE_FOCUS]: (payload: PresenceFocusPayload) => void;
  [SocketEvents.PRESENCE_VISIBILITY]: (payload: PresenceVisibilityPayload) => void;
  [SocketEvents.MATCH_JOIN]: (payload: MatchJoinPayload) => void;
  [SocketEvents.MATCH_CANCEL]: () => void;
  [SocketEvents.CHAT_JOIN]: (payload: { conversationId: string }) => void;
  [SocketEvents.CHAT_SEND]: (payload: ChatSendPayload) => void;
  [SocketEvents.CHAT_TYPING]: (payload: ChatTypingPayload) => void;
  [SocketEvents.CHAT_READ]: (payload: ChatReadPayload) => void;
  [SocketEvents.CHAT_DELETE]: (payload: ChatDeletePayload) => void;
  [SocketEvents.CALL_INVITE]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_ACCEPT]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_REJECT]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_OFFER]: (payload: CallSdpPayload) => void;
  [SocketEvents.CALL_ANSWER]: (payload: CallSdpPayload) => void;
  [SocketEvents.CALL_ICE_CANDIDATE]: (payload: CallIceCandidatePayload) => void;
  [SocketEvents.CALL_MEDIA_STATE]: (payload: CallMediaStatePayload) => void;
  [SocketEvents.CALL_HANGUP]: (payload: CallHangupPayload) => void;
}

export interface ServerToClientEvents {
  [SocketEvents.PRESENCE_ONLINE]: (payload: { userId: string }) => void;
  [SocketEvents.PRESENCE_OFFLINE]: (payload: { userId: string }) => void;
  [SocketEvents.MATCH_FOUND]: (payload: MatchFoundPayload) => void;
  [SocketEvents.MATCH_TIMEOUT]: () => void;
  [SocketEvents.CHAT_MESSAGE]: (payload: ChatMessagePayload) => void;
  [SocketEvents.CHAT_ACK]: (payload: ChatAckPayload) => void;
  [SocketEvents.CHAT_TYPING_STATUS]: (payload: ChatTypingPayload & { userId: string }) => void;
  [SocketEvents.CHAT_READ_STATUS]: (payload: ChatReadPayload & { userId: string }) => void;
  [SocketEvents.CHAT_CONVERSATION_ENDED]: (payload: ChatConversationEndedPayload) => void;
  [SocketEvents.CHAT_REACTION]: (payload: ChatReactionPayload) => void;
  [SocketEvents.CHAT_DELETE_STATUS]: (payload: ChatDeleteStatusPayload) => void;
  [SocketEvents.MATCH_QUEUE_STATS]: (payload: MatchQueueStatsPayload) => void;
  [SocketEvents.FRIEND_REQUEST]: (payload: FriendRequestEventPayload) => void;
  [SocketEvents.FRIEND_RESPOND]: (payload: FriendRespondEventPayload) => void;
  [SocketEvents.FRIEND_ONLINE]: (payload: { userId: string }) => void;
  [SocketEvents.FRIEND_OFFLINE]: (payload: { userId: string }) => void;
  [SocketEvents.CALL_INVITE]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_ACCEPT]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_REJECT]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_OFFER]: (payload: CallSdpPayload) => void;
  [SocketEvents.CALL_ANSWER]: (payload: CallSdpPayload) => void;
  [SocketEvents.CALL_ICE_CANDIDATE]: (payload: CallIceCandidatePayload) => void;
  [SocketEvents.CALL_MEDIA_STATE]: (payload: CallMediaStatePayload) => void;
  [SocketEvents.CALL_HANGUP]: (payload: CallHangupPayload) => void;
  [SocketEvents.NOTIFICATION_NEW]: (payload: NotificationPayload) => void;
  [SocketEvents.CHAT_ICEBREAKER_CHUNK]: (payload: ChatIcebreakerChunkPayload) => void;
  [SocketEvents.CHAT_ICEBREAKER_DONE]: (payload: ChatIcebreakerDonePayload) => void;
  [SocketEvents.CHAT_SUGGESTIONS]: (payload: ChatSuggestionsPayload) => void;
}
