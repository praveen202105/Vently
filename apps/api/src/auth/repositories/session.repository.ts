import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const REFRESH_BYTES = 64;

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken() {
  return randomBytes(REFRESH_BYTES).toString('base64url');
}

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(args: { userId: string; refreshToken: string; expiresAt: Date; deviceInfo?: string }) {
    return this.prisma.session.create({
      data: {
        userId: args.userId,
        refreshTokenHash: hashToken(args.refreshToken),
        expiresAt: args.expiresAt,
        deviceInfo: args.deviceInfo,
      },
    });
  }

  findByToken(refreshToken: string) {
    return this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
  }

  deleteById(id: string) {
    return this.prisma.session.delete({ where: { id } }).catch(() => undefined);
  }

  deleteByToken(refreshToken: string) {
    return this.prisma.session
      .delete({ where: { refreshTokenHash: hashToken(refreshToken) } })
      .catch(() => undefined);
  }

  deleteAllForUser(userId: string) {
    return this.prisma.session.deleteMany({ where: { userId } });
  }
}
