import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { SuggestionsModule } from '../suggestions/suggestions.module.js';
import { AIPeerModule } from '../ai-peer/ai-peer.module.js';
import { ChatGateway } from './chat.gateway.js';

@Module({
  imports: [ConversationsModule, MessagesModule, SuggestionsModule, AIPeerModule],
  providers: [ChatGateway],
})
export class ChatModule {}
