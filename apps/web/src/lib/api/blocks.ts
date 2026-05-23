import { api } from './client';

export interface BlockedSummary {
  blockedId: string;
  createdAt: string;
  profile: { userId: string; nickname: string; avatarSeed: string } | null;
}

export function listBlocks() {
  return api<BlockedSummary[]>('/blocks');
}

export function blockUser(userId: string) {
  return api<void>('/blocks', { method: 'POST', body: { userId } });
}

export function unblockUser(userId: string) {
  return api<void>(`/blocks/${userId}`, { method: 'DELETE' });
}
