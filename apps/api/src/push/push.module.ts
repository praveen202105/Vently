import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';
import { PushRepository } from './push.repository.js';

// @Global so chat.gateway, friends.controller, blocks etc. can inject
// PushService without wiring imports through every feature module.
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService, PushRepository],
  exports: [PushService],
})
export class PushModule {}
