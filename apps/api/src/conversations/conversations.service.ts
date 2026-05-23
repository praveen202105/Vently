import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository.js';

@Injectable()
export class ConversationsService {
  constructor(private readonly repo: ConversationsRepository) {}

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
}
