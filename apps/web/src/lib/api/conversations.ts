import type { ConversationDetail, ConversationSummary, MessagePage, MessagePublic } from '@vently/shared';
import { api } from './client';

export function listConversations() {
  return api<ConversationSummary[]>('/conversations');
}

export function getConversation(conversationId: string) {
  return api<ConversationDetail>(`/conversations/${conversationId}`);
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

export function getUnreadCount() {
  return api<{ count: number }>('/conversations/unread-count');
}

export function searchMessages(conversationId: string, q: string) {
  const params = new URLSearchParams({ q });
  return api<{ items: MessagePublic[] }>(`/conversations/${conversationId}/messages/search?${params}`);
}
