import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type Role, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SessionRepository,
  generateRefreshToken,
} from './repositories/session.repository.js';

const BCRYPT_COST = 12;
const ACCESS_TTL_SECONDS = 60 * 15; // 15 minutes
const REFRESH_TTL_DAYS = 30;

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessions: SessionRepository,
  ) {}

  async register(email: string, password: string): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    try {
      const user = await this.prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true, role: true, createdAt: true },
      });
      const tokens = await this.issueTokens(user);
      return { user, tokens };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true, createdAt: true },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
    const tokens = await this.issueTokens(publicUser);
    return { user: publicUser, tokens };
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const session = await this.sessions.findByToken(refreshToken);
    if (!session) {
      // Unknown / already-rotated refresh — possible token reuse. Best-effort
      // mitigation: nothing to revoke since we can't identify the user.
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessions.deleteById(session.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: invalidate the old session and issue a new pair.
    await this.sessions.deleteById(session.id);

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    return this.issueTokens(user);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.sessions.deleteByToken(refreshToken);
  }

  private async issueTokens(user: PublicUser | User): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TTL_SECONDS,
      },
    );

    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.sessions.create({
      userId: user.id,
      refreshToken,
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken,
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken,
      refreshExpiresAt,
    };
  }
}
