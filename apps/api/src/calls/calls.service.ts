import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallsRepository } from './calls.repository.js';

@Injectable()
export class CallsService {
  constructor(
    private readonly repo: CallsRepository,
    private readonly conversations: ConversationsService,
    private readonly blocks: BlocksService,
    private readonly prisma: PrismaService,
  ) {}

  // Validates both participants + no block, then ensures (creates if missing)
  // an active CallSession row. Idempotent so the offer/answer flow can call it
  // safely regardless of which side fires it first.
  async ensureActive(args: { conversationId: string; callerId: string }) {
    await this.conversations.assertParticipant(args.conversationId, args.callerId);

    const peerPart = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId: args.conversationId, userId: { not: args.callerId } },
      select: { userId: true },
    });
    if (!peerPart) throw new ForbiddenException('No peer in this conversation');

    const blocked = await this.blocks.isBlocked(args.callerId, peerPart.userId);
    if (blocked) throw new ForbiddenException('Blocked');

    const existing = await this.repo.findActive(args.conversationId);
    if (existing) return existing;

    return this.repo.start({
      conversationId: args.conversationId,
      callerId: args.callerId,
      calleeId: peerPart.userId,
    });
  }

  async end(conversationId: string, reason?: string) {
    const active = await this.repo.findActive(conversationId);
    if (!active) return null;
    return this.repo.end(active.id, reason);
  }

  async findPeer(conversationId: string, userId: string) {
    const peer = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    return peer?.userId ?? null;
  }
}
