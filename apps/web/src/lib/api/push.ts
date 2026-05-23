import { api } from './client';

export interface PushSubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function subscribePush(body: PushSubscribeBody) {
  return api<void>('/push/subscribe', { method: 'POST', body });
}

export function unsubscribePush(endpoint: string) {
  const params = new URLSearchParams({ endpoint });
  return api<void>(`/push/subscribe?${params}`, { method: 'DELETE' });
}
