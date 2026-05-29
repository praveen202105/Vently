import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module.js';
import { AIPeerService } from './ai-peer.service.js';
import { AIAgentRunner } from './ai-agent.runner.js';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [AIPeerService, AIAgentRunner],
  exports: [AIPeerService, AIAgentRunner],
})
export class AIPeerModule {}
