import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CallsRepository {
  constructor(private readonly prisma: PrismaService) {}

  start(args: { conversationId: string; callerId: string; calleeId: string }) {
    return this.prisma.callSession.create({
      data: args,
    });
  }

  findActive(conversationId: string) {
    return this.prisma.callSession.findFirst({
      where: { conversationId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  end(id: string, endReason?: string) {
    return this.prisma.callSession.findUnique({ where: { id } }).then(async (existing) => {
      if (!existing || existing.endedAt) return existing;
      const endedAt = new Date();
      const durationSec = Math.max(
        0,
        Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000),
      );
      return this.prisma.callSession.update({
        where: { id },
        data: { endedAt, durationSec, endReason },
      });
    });
  }
}
