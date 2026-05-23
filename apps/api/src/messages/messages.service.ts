import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Message, MessageReaction } from '@prisma/client';
import { SocketEvents } from '@vently/shared';
import { ConversationsService } from '../conversations/conversations.service.js';
import { MessagesRepository } from './messages.repository.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

// Allowlist of reaction emoji. Keeps users from spamming the DB with
// arbitrary strings + matches the picker palette on the client.
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '🔥']);

// Listed message shape includes reactions; the bare DB row doesn't.
type MessageWithReactions = Message & {
  reactions?: Pick<MessageReaction, 'emoji' | 'userId'>[];
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeGateway,
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

  // Idempotent toggle. The server is authoritative — clients shouldn't need
  // to track whether they've already reacted before calling; we look it up
  // and add or remove based on existence.
  async toggleReaction(args: {
    messageId: string;
    userId: string;
    emoji: string;
  }): Promise<{ action: 'add' | 'remove' }> {
    if (!ALLOWED_REACTIONS.has(args.emoji)) {
      throw new ForbiddenException('Unsupported reaction');
    }
    const conversationId = await this.repo.getConversationId(args.messageId);
    if (!conversationId) throw new NotFoundException('Message not found');
    // assertParticipant doubles as IDOR check — only a member of the
    // conversation can react to its messages.
    await this.conversations.assertParticipant(conversationId, args.userId);

    const result = await this.repo.toggleReaction(args);

    // Fan out to everyone in the conversation room so all open clients
    // update their pill row in real time.
    this.realtime.emitToConversation(conversationId, SocketEvents.CHAT_REACTION, {
      messageId: args.messageId,
      conversationId,
      userId: args.userId,
      emoji: args.emoji,
      action: result.action,
    });

    return result;
  }

  private shape(m: MessageWithReactions) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
      deletedAt: m.deletedAt?.toISOString() ?? null,
      reactions: (m.reactions ?? []).map((r) => ({ emoji: r.emoji, userId: r.userId })),
    };
  }
}
