import { Module } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service.js';

@Module({
  providers: [SuggestionsService],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
