import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service.js';
import { TranslationController } from './translation.controller.js';
import { ConversationsModule } from '../conversations/conversations.module.js';

@Module({
  imports: [ConversationsModule],
  providers: [TranslationService],
  controllers: [TranslationController],
  exports: [TranslationService],
})
export class TranslationModule {}
