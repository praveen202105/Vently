import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { ChatGateway } from './chat.gateway.js';

@Module({
  imports: [ConversationsModule, MessagesModule],
  providers: [ChatGateway],
})
export class ChatModule {}
