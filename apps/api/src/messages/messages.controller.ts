import {
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * DELETE /conversations/:id/messages/:messageId
   * Delete a message for everyone. Only the original sender may delete their
   * own messages. Returns 204 on success, 404 if the message doesn't exist or
   * the requester is not the sender.
   */
  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteForEveryone(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.messages.deleteForEveryone({
      messageId,
      requesterId: user.userId,
      conversationId,
    });
    if (!result.ok) {
      throw new NotFoundException(result.error ?? 'Message not found');
    }
  }
}
