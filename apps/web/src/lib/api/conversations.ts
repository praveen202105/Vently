import type { ConversationSummary, MessagePage } from '@vently/shared';
import { api } from './client';

export function listConversations() {
  return api<ConversationSummary[]>('/conversations');
}

export function listMessages(conversationId: string, cursor?: string, limit = 30) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return api<MessagePage>(`/conversations/${conversationId}/messages?${params}`);
}

export function leaveConversation(conversationId: string) {
  return api<void>(`/conversations/${conversationId}`, { method: 'DELETE' });
}
