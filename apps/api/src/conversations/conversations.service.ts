import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly repo: ConversationsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async listForUser(userId: string) {
    const rows = await this.repo.listForUser(userId);
    return rows.map(({ conversation, peer, lastMessage }) => ({
      id: conversation.id,
      type: conversation.type,
      createdAt: conversation.createdAt.toISOString(),
      endedAt: conversation.endedAt?.toISOString() ?? null,
      peer: peer
        ? {
            ...peer,
            lastSeenAt: peer.lastSeenAt.toISOString(),
            createdAt: peer.createdAt.toISOString(),
            updatedAt: peer.updatedAt.toISOString(),
          }
        : null,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            conversationId: lastMessage.conversationId,
            senderId: lastMessage.senderId,
            body: lastMessage.body,
            type: lastMessage.type,
            createdAt: lastMessage.createdAt.toISOString(),
            deletedAt: lastMessage.deletedAt?.toISOString() ?? null,
          }
        : null,
    }));
  }

  async assertParticipant(conversationId: string, userId: string) {
    const part = await this.repo.isParticipant(conversationId, userId);
    if (!part) throw new ForbiddenException('Not a participant in this conversation');
    return part;
  }

  async leave(conversationId: string, userId: string) {
    const part = await this.repo.isParticipant(conversationId, userId);
    if (!part) throw new NotFoundException('Conversation not found');
    await this.repo.setLeftAt(conversationId, userId);
    await this.repo.endConversation(conversationId);
  }

  // Total messages addressed to this user that haven't been read yet. Drives
  // the unread badge on the Chat tab. Counts across every active conversation
  // — the badge only needs a single integer, not per-conversation breakdown.
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.message.count({
      where: {
        deletedAt: null,
        senderId: { not: userId },
        conversation: {
          endedAt: null,
          participants: { some: { userId } },
        },
        receipts: { none: { userId, readAt: { not: null } } },
      },
    });
    return { count };
  }
}
