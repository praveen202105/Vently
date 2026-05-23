/**
 * Socket.io event contracts shared by apps/api and apps/web.
 * Adding an event? Add the constant + payload type here so both sides stay in sync.
 */

import type { Gender, MoodIntent } from './types/enums.js';

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

  // Friends
  FRIEND_REQUEST: 'friend:request',
  FRIEND_RESPOND: 'friend:respond',
  FRIEND_ONLINE: 'friend:online',
  FRIEND_OFFLINE: 'friend:offline',

  // Voice calls (WebRTC signaling)
  CALL_INVITE: 'call:invite',
  CALL_ACCEPT: 'call:accept',
  CALL_REJECT: 'call:reject',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_HANGUP: 'call:hangup',

  // Notifications
  NOTIFICATION_NEW: 'notification:new',
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
}

export interface ChatSendPayload {
  conversationId: string;
  body: string;
  clientId: string;
}

export interface ChatMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
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

export interface CallInvitePayload {
  conversationId: string;
  fromUserId: string;
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

export interface NotificationPayload {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ─── Typed event maps ──────────────────────────────────────────────────────

export interface ClientToServerEvents {
  [SocketEvents.PRESENCE_HEARTBEAT]: () => void;
  [SocketEvents.MATCH_JOIN]: (payload: MatchJoinPayload) => void;
  [SocketEvents.MATCH_CANCEL]: () => void;
  [SocketEvents.CHAT_JOIN]: (payload: { conversationId: string }) => void;
  [SocketEvents.CHAT_SEND]: (payload: ChatSendPayload) => void;
  [SocketEvents.CHAT_TYPING]: (payload: ChatTypingPayload) => void;
  [SocketEvents.CHAT_READ]: (payload: ChatReadPayload) => void;
  [SocketEvents.CALL_INVITE]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_ACCEPT]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_REJECT]: (payload: CallInvitePayload) => void;
  [SocketEvents.CALL_OFFER]: (payload: CallSdpPayload) => void;
  [SocketEvents.CALL_ANSWER]: (payload: CallSdpPayload) => void;
  [SocketEvents.CALL_ICE_CANDIDATE]: (payload: CallIceCandidatePayload) => void;
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
  [SocketEvents.CALL_HANGUP]: (payload: CallHangupPayload) => void;
  [SocketEvents.NOTIFICATION_NEW]: (payload: NotificationPayload) => void;
}
