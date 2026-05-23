import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async markOnline(userId: string) {
    try {
      await this.prisma.profile.update({
        where: { userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      });
    } catch (err) {
      // A missing profile (P2025) is expected for users mid-onboarding —
      // socket auth would already have rejected them, but be safe. Other
      // errors (DB down, perms) should not be swallowed silently.
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`markOnline failed for ${userId}: ${(err as Error).message}`);
      }
    }
  }

  async markOffline(userId: string) {
    try {
      await this.prisma.profile.update({
        where: { userId },
        data: { isOnline: false, lastSeenAt: new Date() },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`markOffline failed for ${userId}: ${(err as Error).message}`);
      }
    }
  }
}
