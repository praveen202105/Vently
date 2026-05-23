import { Controller, Get, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [pg, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'down'),
      this.redis.ping().then(() => 'ok').catch(() => 'down'),
    ]);

    const status = pg === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { postgres: pg, redis }, timestamp: new Date().toISOString() };
  }
}
