import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MessagesService } from './messages.service.js';

class ToggleReactionDto {
  @IsString()
  emoji!: string;
}

// Lives at /api/messages/:id/reactions — separate from MessagesController
// (which is nested under /conversations/:id/messages for the list endpoint)
// because the reaction action is keyed by message id directly. Keeps the
// path simple for the client and matches the conventional REST shape.
@Controller('messages/:id/reactions')
@UseGuards(JwtAuthGuard)
export class ReactionsController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.messages.toggleReaction({
      messageId,
      userId: user.userId,
      emoji: dto.emoji,
    });
  }
}
