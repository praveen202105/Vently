import type { Socket } from 'socket.io';
import type { Gender, Role } from '@prisma/client';

export interface SocketUser {
  userId: string;
  email: string;
  role: Role;
  nickname: string;
  gender: Gender;
}

export type AuthedSocket = Socket & { data: { user: SocketUser } };

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function convRoom(conversationId: string) {
  return `conv:${conversationId}`;
}
