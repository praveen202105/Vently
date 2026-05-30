import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AiMemoryController } from './ai-memory.controller.js';
import { AiMemoryService } from './ai-memory.service.js';

@Module({
  imports: [PrismaModule, RedisModule, ProfilesModule],
  controllers: [AiMemoryController],
  providers: [AiMemoryService],
  exports: [AiMemoryService],
})
export class AiMemoryModule {}
