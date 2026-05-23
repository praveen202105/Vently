import { Injectable, Logger } from '@nestjs/common';
import type { FriendReqStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

// Canonical-pair helper: friendships are always stored with userAId < userBId
// so we can look them up regardless of which side initiated.
export function pairKey(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

@Injectable()
export class FriendsRepository {
  private readonly logger = new Logger(FriendsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Friend requests ──────────────────────────────────────────────────

  createRequest(fromUserId: string, toUserId: string) {
    return this.prisma.friendRequest.create({
      data: { fromUserId, toUserId },
    });
  }

  findRequest(id: string) {
    return this.prisma.friendRequest.findUnique({ where: { id } });
  }

  findRequestBetween(fromUserId: string, toUserId: string) {
    return this.prisma.friendRequest.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
    });
  }

  updateRequestStatus(id: string, status: FriendReqStatus) {
    return this.prisma.friendRequest.update({
      where: { id },
      data: { status },
    });
  }

  listIncoming(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  listOutgoing(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { fromUserId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Friendships ──────────────────────────────────────────────────────

  createFriendship(a: string, b: string) {
    const { userAId, userBId } = pairKey(a, b);
    return this.prisma.friendship.create({ data: { userAId, userBId } });
  }

  async deleteFriendship(a: string, b: string) {
    const key = pairKey(a, b);
    try {
      return await this.prisma.friendship.delete({ where: { userAId_userBId: key } });
    } catch (err) {
      // P2025 = no friendship to delete (idempotent unfriend). Log anything
      // else so DB connection failures don't disappear into the void.
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`friendship.delete(${a},${b}) failed: ${(err as Error).message}`);
      }
      return undefined;
    }
  }

  findFriendship(a: string, b: string) {
    const key = pairKey(a, b);
    return this.prisma.friendship.findUnique({ where: { userAId_userBId: key } });
  }

  async listFriendsForUser(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      friendUserId: r.userAId === userId ? r.userBId : r.userAId,
      since: r.createdAt,
    }));
  }
}
