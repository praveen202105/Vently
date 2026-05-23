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
  // Each message now ships with its reactions inline so the client can render
  // the pill row without an extra round-trip per bubble.
  async listPage(conversationId: string, cursor?: string, limit = 30) {
    const where = { conversationId, deletedAt: null };
    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { reactions: { select: { emoji: true, userId: true } } },
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

  // Idempotent reaction toggle: returns whether the reaction was added or
  // removed. Implementation uses the unique constraint on
  // (messageId, userId, emoji) so concurrent taps don't dup-insert.
  async toggleReaction(args: {
    messageId: string;
    userId: string;
    emoji: string;
  }): Promise<{ action: 'add' | 'remove' }> {
    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: args.messageId,
          userId: args.userId,
          emoji: args.emoji,
        },
      },
    });
    if (existing) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } });
      return { action: 'remove' };
    }
    await this.prisma.messageReaction.create({
      data: {
        messageId: args.messageId,
        userId: args.userId,
        emoji: args.emoji,
      },
    });
    return { action: 'add' };
  }

  // Find the conversation id of a message (lookup needed for assertParticipant
  // before letting a reaction land).
  async getConversationId(messageId: string): Promise<string | null> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    return msg?.conversationId ?? null;
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
