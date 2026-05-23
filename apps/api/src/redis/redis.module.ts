import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_PUB = Symbol('REDIS_PUB');
export const REDIS_SUB = Symbol('REDIS_SUB');

function createRedis(config: ConfigService) {
  const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  return new Redis(url, { maxRetriesPerRequest: null });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedis,
    },
    {
      provide: REDIS_PUB,
      inject: [ConfigService],
      useFactory: createRedis,
    },
    {
      provide: REDIS_SUB,
      inject: [ConfigService],
      useFactory: createRedis,
    },
  ],
  exports: [REDIS_CLIENT, REDIS_PUB, REDIS_SUB],
})
export class RedisModule {}
