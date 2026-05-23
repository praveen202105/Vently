import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BlocksRepository } from './blocks.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  // No RealtimeGateway injection here on purpose: that would close a cycle
  // RealtimeGateway → MatchmakingService → BlocksService → RealtimeGateway
  // which Nest's DI can't resolve at startup (forwardRef wasn't enough — it
  // still failed under MatchmakingModule's import chain). Instead, block()
  // returns the conversation IDs it ended and the controller emits the
  // CHAT_CONVERSATION_ENDED event — controllers can safely depend on the
  // gateway (FriendsController already does).
  constructor(
    private readonly repo: BlocksRepository,
    private readonly prisma: PrismaService,
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

  async block(blockerId: string, blockedId: string): Promise<{ endedConversationIds: string[] }> {
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
    // so the controller can notify the blocked peer. Without that notification,
    // the blocked user sits in the chat screen forever watching "online"
    // status they can't reach.
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
    return { endedConversationIds: activeConvs.map((c) => c.id) };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.repo.delete(blockerId, blockedId);
  }

  isBlocked(a: string, b: string) {
    return this.repo.isBlocked(a, b);
  }
}
