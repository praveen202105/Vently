import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { BlocksService } from './blocks.service.js';

class CreateBlockDto {
  @IsString()
  userId!: string;
}

@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.blocks.list(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(@CurrentUser() user: AuthUser, @Body() dto: CreateBlockDto) {
    await this.blocks.block(user.userId, dto.userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@CurrentUser() user: AuthUser, @Param('userId') blockedId: string) {
    await this.blocks.unblock(user.userId, blockedId);
  }
}
