import { Global, Module } from '@nestjs/common';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';
import { BlocksRepository } from './blocks.repository.js';

@Global()
@Module({
  controllers: [BlocksController],
  providers: [BlocksService, BlocksRepository],
  exports: [BlocksService],
})
export class BlocksModule {}
