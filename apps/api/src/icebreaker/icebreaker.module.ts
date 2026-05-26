import { Module } from '@nestjs/common';
import { IcebreakerService } from './icebreaker.service.js';

// PrismaModule and ModerationModule are @Global() so their providers resolve
// automatically — no explicit imports needed here.
@Module({
  providers: [IcebreakerService],
  exports: [IcebreakerService],
})
export class IcebreakerModule {}
