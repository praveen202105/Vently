import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BlocksRepository {
  private readonly logger = new Logger(BlocksRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  create(blockerId: string, blockedId: string) {
    return this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }

  async delete(blockerId: string, blockedId: string) {
    try {
      return await this.prisma.block.delete({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
    } catch (err) {
      // P2025 = "no such block" — idempotent unblock, expected. Anything
      // else is a real failure we want logged (not silently dropped).
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`block.delete failed: ${(err as Error).message}`);
      }
      return undefined;
    }
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
