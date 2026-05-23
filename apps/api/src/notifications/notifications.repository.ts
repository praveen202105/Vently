import { Injectable } from '@nestjs/common';
import type { NotifType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(args: { userId: string; type: NotifType; payload: Prisma.JsonObject }) {
    return this.prisma.notification.create({ data: args });
  }

  listForUser(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
