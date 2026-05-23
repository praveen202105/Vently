import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service.js';
import { MatchmakingGateway } from './matchmaking.gateway.js';

@Module({
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
