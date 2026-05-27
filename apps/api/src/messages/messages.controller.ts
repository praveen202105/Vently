import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MessagesService } from './messages.service.js';

@Controller('conversations/:id/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Query('q') q: string,
  ) {
    return this.messages.search({ conversationId, userId: user.userId, q: q ?? '' });
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.messages.listPage({
      conversationId,
      userId: user.userId,
      cursor,
      limit,
    });
  }
}
