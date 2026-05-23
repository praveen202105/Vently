import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PresenceModule } from '../presence/presence.module.js';
import { MatchmakingModule } from '../matchmaking/matchmaking.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  imports: [JwtModule.register({}), PresenceModule, MatchmakingModule, ChatModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
