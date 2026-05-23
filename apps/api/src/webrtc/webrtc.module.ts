import { Module } from '@nestjs/common';
import { WebrtcController } from './webrtc.controller.js';
import { IceService } from './ice.service.js';

@Module({
  controllers: [WebrtcController],
  providers: [IceService],
  exports: [IceService],
})
export class WebrtcModule {}
