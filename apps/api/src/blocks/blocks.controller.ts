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
import { SocketEvents } from '@vently/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { BlocksService } from './blocks.service.js';

class CreateBlockDto {
  @IsString()
  userId!: string;
}

@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  // Controllers can safely depend on RealtimeGateway — they're constructed
  // after all services + gateways. Putting this dep on BlocksService would
  // close the cycle Realtime→Matchmaking→Blocks→Realtime and Nest can't
  // resolve it (forwardRef alone wasn't enough). Keeping the emit in the
  // controller is the cleanest break.
  constructor(
    private readonly blocks: BlocksService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.blocks.list(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(@CurrentUser() user: AuthUser, @Body() dto: CreateBlockDto) {
    const { endedConversationIds } = await this.blocks.block(user.userId, dto.userId);
    // Tell the blocked peer that any active chat with the blocker has ended,
    // so their UI redirects out of the now-dead conversation room instead of
    // sitting on "online" forever.
    for (const conversationId of endedConversationIds) {
      this.realtime.emitToUser(dto.userId, SocketEvents.CHAT_CONVERSATION_ENDED, {
        conversationId,
        reason: 'blocked',
      });
    }
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@CurrentUser() user: AuthUser, @Param('userId') blockedId: string) {
    await this.blocks.unblock(user.userId, blockedId);
  }
}
