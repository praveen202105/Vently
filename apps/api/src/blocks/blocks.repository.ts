import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BlocksRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(blockerId: string, blockedId: string) {
    return this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }

  delete(blockerId: string, blockedId: string) {
    return this.prisma.block
      .delete({ where: { blockerId_blockedId: { blockerId, blockedId } } })
      .catch(() => undefined);
  }

  listForUser(blockerId: string) {
    return this.prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  isBlocked(a: string, b: string) {
    return this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
  }
}
