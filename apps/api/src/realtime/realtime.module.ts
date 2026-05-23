import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PresenceModule } from '../presence/presence.module.js';
import { MatchmakingModule } from '../matchmaking/matchmaking.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { SocketThrottleService } from './socket-throttle.service.js';
import { FocusService } from './focus.service.js';

@Global()
@Module({
  imports: [JwtModule.register({}), PresenceModule, MatchmakingModule, ChatModule],
  providers: [RealtimeGateway, SocketThrottleService, FocusService],
  exports: [RealtimeGateway, SocketThrottleService, FocusService],
})
export class RealtimeModule {}
