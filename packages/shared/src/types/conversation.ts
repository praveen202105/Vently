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

export interface MessagePublic {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: MessageType;
  createdAt: string;
  deletedAt: string | null;
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
