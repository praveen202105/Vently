import { BadRequestException, Injectable } from '@nestjs/common';
import { BlocksRepository } from './blocks.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BlocksService {
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
      .catch(() => undefined);
    await this.prisma.conversation.updateMany({
      where: {
        endedAt: null,
        AND: [
          { participants: { some: { userId: blockerId } } },
          { participants: { some: { userId: blockedId } } },
        ],
      },
      data: { endedAt: new Date() },
    });
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.repo.delete(blockerId, blockedId);
  }

  isBlocked(a: string, b: string) {
    return this.repo.isBlocked(a, b);
  }
}
