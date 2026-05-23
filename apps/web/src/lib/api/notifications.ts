import type { NotificationPublic } from '@vently/shared';
import { api } from './client';

export function listNotifications() {
  return api<NotificationPublic[]>('/notifications');
}

export function markNotificationRead(id: string) {
  return api<void>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return api<void>('/notifications/read-all', { method: 'PATCH' });
}
