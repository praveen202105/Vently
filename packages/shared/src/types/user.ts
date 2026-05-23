import type { Gender, MoodIntent, Role } from './enums.js';

export interface UserPublic {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface ProfilePublic {
  userId: string;
  nickname: string;
  gender: Gender;
  bio: string | null;
  avatarSeed: string;
  mood: MoodIntent | null;
  isOnline: boolean;
  lastSeenAt: string;
}

export interface MeResponse {
  user: UserPublic;
  profile: ProfilePublic | null;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface AuthResponse extends AuthTokens {
  user: UserPublic;
  profile: ProfilePublic | null;
}
