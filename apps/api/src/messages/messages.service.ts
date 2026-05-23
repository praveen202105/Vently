import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service.js';
import { MessagesRepository } from './messages.repository.js';

@Injectable()
export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly conversations: ConversationsService,
  ) {}

  async listPage(args: {
    conversationId: string;
    userId: string;
    cursor?: string;
    limit?: number;
  }) {
    await this.conversations.assertParticipant(args.conversationId, args.userId);
    const page = await this.repo.listPage(args.conversationId, args.cursor, args.limit ?? 30);
    return {
      items: page.items.map((m) => this.shape(m)),
      nextCursor: page.nextCursor,
    };
  }

  async send(args: { conversationId: string; senderId: string; body: string }) {
    await this.conversations.assertParticipant(args.conversationId, args.senderId);
    const message = await this.repo.create(args);
    return this.shape(message);
  }

  markRead(args: { conversationId: string; userId: string; lastMessageId: string }) {
    return this.repo.markRead(args);
  }

  private shape(m: Message) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
      deletedAt: m.deletedAt?.toISOString() ?? null,
    };
  }
}
