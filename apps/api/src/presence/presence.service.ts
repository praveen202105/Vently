import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async markOnline(userId: string) {
    await this.prisma.profile.update({
      where: { userId },
      data: { isOnline: true, lastSeenAt: new Date() },
    }).catch(() => undefined);
  }

  async markOffline(userId: string) {
    await this.prisma.profile.update({
      where: { userId },
      data: { isOnline: false, lastSeenAt: new Date() },
    }).catch(() => undefined);
  }
}
