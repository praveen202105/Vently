import type { FriendPublic, FriendRequestPublic } from '@vently/shared';
import { api } from './client';

export function listFriends() {
  return api<FriendPublic[]>('/friends');
}

export function listFriendRequests() {
  return api<FriendRequestPublic[]>('/friends/requests');
}

export function sendFriendRequest(toUserId: string) {
  return api<{ kind: 'requested' | 'accepted' | 'rejected'; request: FriendRequestPublic }>(
    '/friends/requests',
    { method: 'POST', body: { toUserId } },
  );
}

export function respondToFriendRequest(id: string, accept: boolean) {
  return api<{ kind: 'accepted' | 'rejected'; request: FriendRequestPublic }>(
    `/friends/requests/${id}`,
    { method: 'PATCH', body: { accept } },
  );
}

export function cancelFriendRequest(id: string) {
  return api<void>(`/friends/requests/${id}`, { method: 'DELETE' });
}

export function unfriend(userId: string) {
  return api<void>(`/friends/${userId}`, { method: 'DELETE' });
}
