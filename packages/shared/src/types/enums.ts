/**
 * Domain enums kept as plain TS string-unions so they can be consumed by both
 * the web (no Prisma client) and the api (with Prisma client). They mirror the
 * enums in prisma/schema.prisma — keep these in sync if the schema changes.
 */

export type Role = 'USER' | 'MOD' | 'ADMIN';

export type Gender = 'MALE' | 'FEMALE';

export type MoodIntent =
  | 'LONELY'
  | 'NEED_TO_TALK'
  | 'FRIENDSHIP'
  | 'LATE_NIGHT'
  | 'ADVICE'
  | 'FLIRTY'
  | 'VOICE_ONLY';

export type ConvType = 'DIRECT' | 'FRIEND';

export type MessageType = 'TEXT' | 'SYSTEM';

export type FriendReqStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED';

export type NotifType =
  | 'MATCH_FOUND'
  | 'MESSAGE'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'MISSED_CALL'
  | 'SYSTEM';
