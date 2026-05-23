import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PushRepository } from './push.repository.js';

class SubscribePushDto {
  @IsString()
  endpoint!: string;
  @IsString()
  p256dh!: string;
  @IsString()
  auth!: string;
}

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly repo: PushRepository) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribePushDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.repo.upsert({
      userId: user.userId,
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      userAgent: userAgent ?? null,
    });
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@CurrentUser() _user: AuthUser, @Query('endpoint') endpoint: string) {
    if (!endpoint) return;
    await this.repo.deleteByEndpoint(endpoint);
  }
}
