import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallsRepository } from './calls.repository.js';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

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

  // Find the conversation's other participant — but only if the requester is
  // actually a member. Without the membership check, a third party who knows a
  // conversationId could inject SDP/ICE into someone else's call by emitting
  // CALL_OFFER/ANSWER/ICE/HANGUP. We swallow the assertion failure here so the
  // signaling handlers in calls.gateway.ts (which all branch on `if (peerId)`)
  // become silent no-ops for unauthorized requests instead of crashing the
  // socket with an unhandled exception.
  async findPeer(conversationId: string, userId: string) {
    try {
      await this.conversations.assertParticipant(conversationId, userId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        this.logger.warn(
          `findPeer: user ${userId} is not in conversation ${conversationId} — dropping signal`,
        );
        return null;
      }
      throw err;
    }
    const peer = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    return peer?.userId ?? null;
  }
}
