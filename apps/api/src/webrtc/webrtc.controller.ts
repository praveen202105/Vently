import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { IceService } from './ice.service.js';

@Controller('webrtc')
@UseGuards(JwtAuthGuard)
export class WebrtcController {
  constructor(private readonly ice: IceService) {}

  @Get('ice-servers')
  async iceServers() {
    return { iceServers: await this.ice.getIceServers() };
  }
}
