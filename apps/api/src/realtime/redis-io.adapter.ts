import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { REDIS_PUB, REDIS_SUB } from '../redis/redis.module.js';
import type Redis from 'ioredis';

/**
 * Wraps the default Socket.io adapter with Redis pub/sub so we can run multiple
 * api replicas behind a load balancer without sticky sessions on broadcasts.
 * See VENTLY_PLAN.md §3.4.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connect() {
    const pub = this.app.get<Redis>(REDIS_PUB);
    const sub = this.app.get<Redis>(REDIS_SUB);
    this.adapterConstructor = createAdapter(pub, sub);
    this.logger.log('Socket.io Redis adapter connected');
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const corsOrigin =
      process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) ?? 'http://localhost:3000';

    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: corsOrigin,
        credentials: true,
      },
    }) as ReturnType<IoAdapter['createIOServer']>;

    if (this.adapterConstructor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server as any).adapter(this.adapterConstructor);
    }
    return server;
  }
}
