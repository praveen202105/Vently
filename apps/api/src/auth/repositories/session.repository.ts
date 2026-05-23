import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(SessionRepository.name);

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

  async deleteById(id: string) {
    try {
      return await this.prisma.session.delete({ where: { id } });
    } catch (err) {
      // P2025 = session already gone (concurrent logout/refresh rotation).
      // Idempotent. Other errors get logged so DB issues aren't invisible.
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`session.deleteById(${id}) failed: ${(err as Error).message}`);
      }
      return undefined;
    }
  }

  async deleteByToken(refreshToken: string) {
    try {
      return await this.prisma.session.delete({
        where: { refreshTokenHash: hashToken(refreshToken) },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') {
        this.logger.warn(`session.deleteByToken failed: ${(err as Error).message}`);
      }
      return undefined;
    }
  }

  deleteAllForUser(userId: string) {
    return this.prisma.session.deleteMany({ where: { userId } });
  }
}
