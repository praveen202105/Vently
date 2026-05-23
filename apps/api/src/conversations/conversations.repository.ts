import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // List of conversations the user is currently a participant of, with the
  // peer's profile + the latest message attached.
  async listForUser(userId: string) {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { userId, leftAt: null },
      select: { conversationId: true, joinedAt: true },
      orderBy: { joinedAt: 'desc' },
    });
    if (parts.length === 0) return [];

    const convoIds = parts.map((p) => p.conversationId);

    const convos = await this.prisma.conversation.findMany({
      where: { id: { in: convoIds } },
      include: {
        participants: {
          where: { userId: { not: userId } },
          select: {
            userId: true,
            conversation: { select: { id: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Fetch peer profiles in one query.
    const peerIds = convos.flatMap((c) => c.participants.map((p) => p.userId));
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: peerIds } },
    });
    const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

    return convos.map((c) => ({
      conversation: c,
      peer: c.participants[0] ? profileByUserId.get(c.participants[0].userId) ?? null : null,
      lastMessage: c.messages[0] ?? null,
    }));
  }

  isParticipant(conversationId: string, userId: string) {
    return this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
  }

  endConversation(conversationId: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { endedAt: new Date() },
    });
  }

  setLeftAt(conversationId: string, userId: string) {
    return this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { leftAt: new Date() },
    });
  }
}
