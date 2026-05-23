import { BadRequestException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { SocketEvents } from '@vently/shared';
import { BlocksRepository } from './blocks.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  // RealtimeGateway is forwardRef'd because the dep graph cycles:
  //   RealtimeGateway → MatchmakingService → BlocksService → RealtimeGateway.
  // Without forwardRef, Nest fails to resolve at startup with
  // "argument dependency at index [4] is not available in RealtimeModule".
  constructor(
    private readonly repo: BlocksRepository,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string) {
    const rows = await this.repo.listForUser(userId);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.blockedId);
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, nickname: true, avatarSeed: true },
    });
    const map = new Map(profiles.map((p) => [p.userId, p]));
    return rows.map((r) => ({
      blockedId: r.blockedId,
      createdAt: r.createdAt.toISOString(),
      profile: map.get(r.blockedId) ?? null,
    }));
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException("You can't block yourself");
    await this.repo.create(blockerId, blockedId);
    // Side effect: tear down friendship + end any active conversation between them.
    await this.prisma.friendship
      .delete({
        where: {
          userAId_userBId:
            blockerId < blockedId
              ? { userAId: blockerId, userBId: blockedId }
              : { userAId: blockedId, userBId: blockerId },
        },
      })
      .catch((err: unknown) => {
        // P2025 = no friendship to delete (the two users may have never been
        // friends). That's expected when blocking a stranger — don't log it.
        // Any other failure (DB down, perms) is a real problem worth knowing.
        const code = (err as { code?: string }).code;
        if (code !== 'P2025') {
          this.logger.warn(
            `friendship.delete during block(${blockerId}->${blockedId}) failed: ${(err as Error).message}`,
          );
        }
      });

    // Find every active conversation between the two users BEFORE ending them
    // so we can notify the blocked peer. Without this, the blocked user sits
    // in the chat screen forever, watching "online" status they can't reach.
    const activeConvs = await this.prisma.conversation.findMany({
      where: {
        endedAt: null,
        AND: [
          { participants: { some: { userId: blockerId } } },
          { participants: { some: { userId: blockedId } } },
        ],
      },
      select: { id: true },
    });
    await this.prisma.conversation.updateMany({
      where: { id: { in: activeConvs.map((c) => c.id) } },
      data: { endedAt: new Date() },
    });
    for (const conv of activeConvs) {
      this.realtime.emitToUser(blockedId, SocketEvents.CHAT_CONVERSATION_ENDED, {
        conversationId: conv.id,
        reason: 'blocked',
      });
    }
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.repo.delete(blockerId, blockedId);
  }

  isBlocked(a: string, b: string) {
    return this.repo.isBlocked(a, b);
  }
}
