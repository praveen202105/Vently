import { Global, Module } from '@nestjs/common';
import { ModerationService } from './moderation.service.js';

@Global()
@Module({
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
