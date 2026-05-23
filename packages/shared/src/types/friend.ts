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

export interface FriendPublic {
  profile: ProfilePublic;
  friendedAt: string;
  conversationId: string | null;
}
