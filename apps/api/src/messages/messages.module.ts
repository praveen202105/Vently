import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { MessagesController } from './messages.controller.js';
import { ReactionsController } from './reactions.controller.js';
import { MessagesService } from './messages.service.js';
import { MessagesRepository } from './messages.repository.js';

@Module({
  imports: [ConversationsModule],
  controllers: [MessagesController, ReactionsController],
  providers: [MessagesService, MessagesRepository],
  exports: [MessagesService, MessagesRepository],
})
export class MessagesModule {}
