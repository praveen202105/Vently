import type { NotifType } from './enums.js';

export interface NotificationPublic {
  id: string;
  userId: string;
  type: NotifType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
