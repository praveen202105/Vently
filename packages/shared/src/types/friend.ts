import type { FriendReqStatus } from './enums.js';
import type { ProfilePublic } from './user.js';

export interface FriendRequestPublic {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendReqStatus;
  createdAt: string;
  from?: ProfilePublic;
  to?: ProfilePublic;
}

export interface FriendLastMessage {
  id: string;
  body: string;
  senderId: string;
  type: string;
  createdAt: string;
}

export interface FriendPublic {
  profile: ProfilePublic;
  friendedAt: string;
  conversationId: string | null;
  // Latest non-deleted message in the friend conversation, or null if they've
  // never exchanged a message. Drives the preview on the /connections tile.
  lastMessage: FriendLastMessage | null;
  // How many messages from this friend the current user hasn't read yet.
  // Capped at the source — UI may further collapse to "9+".
  unreadCount: number;
}
