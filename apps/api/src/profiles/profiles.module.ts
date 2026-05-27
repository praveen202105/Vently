import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';
import { ProfilesRepository } from './profiles.repository.js';
import { EmbeddingService } from './embedding.service.js';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilesRepository, EmbeddingService],
  exports: [ProfilesService, ProfilesRepository, EmbeddingService],
})
export class ProfilesModule {}
