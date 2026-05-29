import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service.js';
import { MatchmakingGateway } from './matchmaking.gateway.js';
import { IcebreakerModule } from '../icebreaker/icebreaker.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AIPeerModule } from '../ai-peer/ai-peer.module.js';

@Module({
  imports: [IcebreakerModule, ProfilesModule, AIPeerModule],
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
