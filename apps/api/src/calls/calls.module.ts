import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CallsService } from './calls.service.js';
import { CallsRepository } from './calls.repository.js';
import { CallsGateway } from './calls.gateway.js';

@Module({
  imports: [ConversationsModule, RealtimeModule],
  providers: [CallsService, CallsRepository, CallsGateway],
  exports: [CallsService],
})
export class CallsModule {}
