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

  async leave(conversationId: string, userId: string): Promise<{ peerUserIds: string[] }> {
    const part = await this.repo.isParticipant(conversationId, userId);
    if (!part) throw new NotFoundException('Conversation not found');

    // FRIEND conversations are persistent — "End" on the client side is a
    // navigation, not a destruction. The leaver's leftAt doesn't get set so
    // their participant row stays whole and they can re-enter from
    // /connections at any time with the full message history intact. The
    // peer isn't notified (no CHAT_CONVERSATION_ENDED) because the chat
    // isn't ending. Block + Unfriend continue to be the explicit ways to
    // tear down a friend chat (handled in blocks.service / friends.service).
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    if (conv?.type === 'FRIEND') {
      return { peerUserIds: [] };
    }

    // DIRECT conversations: unchanged behaviour. Capture the other
    // participants BEFORE ending so the controller can emit
    // CHAT_CONVERSATION_ENDED to them. Without this, the peer stays parked
    // on the chat screen typing into a conversation that's already over.
    const others = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });

    await this.repo.setLeftAt(conversationId, userId);
    await this.repo.endConversation(conversationId);

    return { peerUserIds: others.map((p) => p.userId) };
  }

  async getConversation(conversationId: string, userId: string) {
    // Single-conversation metadata — used by chat-screen on mount to decide
    // whether the End button should say "End" (DIRECT) or "Back to friends"
    // (FRIEND), and to recover peer info if match-store hasn't been hydrated
    // (e.g. user opened /chat/[id] directly via a /connections deep link).
    await this.assertParticipant(conversationId, userId);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true, createdAt: true, endedAt: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // ConversationParticipant has no `user` relation — fetch the peer's
    // profile separately so the chat-screen can render their nickname /
    // avatar / online status on a cold load.
    const peerPart = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    const peerProfile = peerPart
      ? await this.prisma.profile.findUnique({
          where: { userId: peerPart.userId },
          select: { userId: true, nickname: true, gender: true, avatarSeed: true, isOnline: true },
        })
      : null;

    // Check if they met before (in a prior ended DIRECT conversation)
    const pastConvo = peerPart
      ? await this.prisma.conversation.findFirst({
          where: {
            id: { not: conversationId },
            type: 'DIRECT',
            endedAt: { not: null },
            AND: [
              { participants: { some: { userId } } },
              { participants: { some: { userId: peerPart.userId } } },
            ],
          },
          orderBy: { endedAt: 'desc' },
          select: { endedAt: true },
        })
      : null;

    return {
      id: conv.id,
      type: conv.type,
      createdAt: conv.createdAt.toISOString(),
      endedAt: conv.endedAt?.toISOString() ?? null,
      peer: peerProfile
        ? {
            userId: peerProfile.userId,
            nickname: peerProfile.nickname,
            gender: peerProfile.gender,
            avatarSeed: peerProfile.avatarSeed,
            isOnline: peerProfile.isOnline,
          }
        : null,
      lastMetAt: pastConvo?.endedAt?.toISOString() ?? null,
    };
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
