import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface UpsertArgs {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

@Injectable()
export class PushRepository {
  private readonly logger = new Logger(PushRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // Upsert by endpoint — same browser re-subscribing on a new session
  // shouldn't create duplicate rows. The endpoint has a @unique constraint
  // in the schema so this is a single atomic write.
  upsert(args: UpsertArgs) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: args.endpoint },
      create: {
        userId: args.userId,
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
      },
      update: {
        userId: args.userId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
      },
    });
  }

  findByUser(userId: string) {
    return this.prisma.pushSubscription.findMany({ where: { userId } });
  }

  async deleteByEndpoint(endpoint: string) {
    try {
      return await this.prisma.pushSubscription.delete({ where: { endpoint } });
    } catch (err) {
      // P2025 = already gone — fine for idempotent unsubscribe.
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`pushSubscription.delete failed: ${(err as Error).message}`);
      }
      return undefined;
    }
  }
}
