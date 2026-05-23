import { Injectable } from '@nestjs/common';
import type { NotifType, Prisma } from '@prisma/client';
import { SocketEvents } from '@vently/shared';
import { NotificationsRepository } from './notifications.repository.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string) {
    const rows = await this.repo.listForUser(userId);
    return rows.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      payload: n.payload as Record<string, unknown>,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async push(userId: string, type: NotifType, payload: Prisma.JsonObject) {
    const row = await this.repo.create({ userId, type, payload });
    this.realtime.emitToUser(userId, SocketEvents.NOTIFICATION_NEW, {
      id: row.id,
      type: row.type,
      payload: row.payload as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    });
    return row;
  }

  markRead(userId: string, id: string) {
    return this.repo.markRead(id, userId);
  }

  markAllRead(userId: string) {
    return this.repo.markAllRead(userId);
  }
}
