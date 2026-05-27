import { Module } from '@nestjs/common';
import { IcebreakerService } from './icebreaker.service.js';
import { SuggestionsModule } from '../suggestions/suggestions.module.js';

// PrismaModule and ModerationModule are @Global() so their providers resolve
// automatically — no explicit imports needed here.
@Module({
  imports: [SuggestionsModule],
  providers: [IcebreakerService],
  exports: [IcebreakerService],
})
export class IcebreakerModule {}
