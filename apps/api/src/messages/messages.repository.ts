import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(args: { conversationId: string; senderId: string; body: string }) {
    return this.prisma.message.create({
      data: {
        conversationId: args.conversationId,
        senderId: args.senderId,
        body: args.body,
        type: 'TEXT',
      },
    });
  }

  // Cursor pagination: pass the oldest message id you have. Returns the next
  // page of messages older than that, plus a nextCursor if there are more.
  async listPage(conversationId: string, cursor?: string, limit = 30) {
    const where = { conversationId, deletedAt: null };
    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const last = items.length > 0 ? items[items.length - 1] : undefined;
    return {
      items: items.reverse(), // chronological for the UI
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  async markRead(args: { conversationId: string; userId: string; lastMessageId: string }) {
    // Find the createdAt of the boundary message so we can mark everything
    // older than it as read for this user.
    const boundary = await this.prisma.message.findUnique({
      where: { id: args.lastMessageId },
      select: { createdAt: true, conversationId: true },
    });
    if (!boundary || boundary.conversationId !== args.conversationId) return;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: args.conversationId,
        senderId: { not: args.userId },
        createdAt: { lte: boundary.createdAt },
      },
      select: { id: true },
    });

    if (messages.length === 0) return;

    await this.prisma.$transaction(
      messages.map((m) =>
        this.prisma.messageReceipt.upsert({
          where: { messageId_userId: { messageId: m.id, userId: args.userId } },
          update: { readAt: new Date() },
          create: { messageId: m.id, userId: args.userId, readAt: new Date() },
        }),
      ),
    );
  }
}
