import type { ConvType, MessageType } from './enums.js';
import type { ProfilePublic } from './user.js';

export interface ConversationSummary {
  id: string;
  type: ConvType;
  createdAt: string;
  endedAt: string | null;
  peer: ProfilePublic | null;
  lastMessage: MessagePublic | null;
  unreadCount: number;
}

// Minimal shape returned by GET /conversations/:id. Chat-screen reads this on
// mount to decide whether the End button means "End" (DIRECT) or "Back to
// friends" (FRIEND), and to hydrate peer info if the match-store hasn't been
// populated (deep-link into /chat/[id] from /connections).
export interface ConversationDetail {
  id: string;
  type: ConvType;
  createdAt: string;
  endedAt: string | null;
  peer: {
    userId: string;
    nickname: string;
    gender: ProfilePublic['gender'];
    avatarSeed: string;
    isOnline: boolean;
  } | null;
  lastMetAt?: string | null;
}

export interface MessageReactionPublic {
  emoji: string;
  userId: string;
}

export interface MessagePublic {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: MessageType;
  createdAt: string;
  deletedAt: string | null;
  // Per-message reactions. The same user can have at most one row per emoji
  // (DB unique constraint), so client-side dedup by (emoji, userId) is safe.
  // Empty array when the message has no reactions yet.
  reactions: MessageReactionPublic[];
  /** For quote-reply: the id of the message being replied to, if any. */
  replyToMessageId?: string | null;
  /** Snapshot of the quoted body, populated by the server at send-time. */
  replyToBody?: string | null;
}

export interface MessagePage {
  items: MessagePublic[];
  nextCursor: string | null;
}

export interface CallSummary {
  id: string;
  conversationId: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  endReason: string | null;
}
