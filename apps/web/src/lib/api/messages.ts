import { api } from './client';

export function toggleReaction(messageId: string, emoji: string) {
  return api<{ action: 'add' | 'remove' }>(`/messages/${messageId}/reactions`, {
    method: 'POST',
    body: { emoji },
  });
}
