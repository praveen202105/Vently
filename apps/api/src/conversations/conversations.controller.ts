import { Controller, Delete, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { SocketEvents } from '@vently/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ConversationsService } from './conversations.service.js';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  // Controller-level RealtimeGateway dep is safe — controllers are constructed
  // after gateways and never depend on services that themselves depend on
  // RealtimeGateway. Same pattern as BlocksController + FriendsController.
  constructor(
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.listForUser(user.userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.conversations.unreadCount(user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { peerUserIds } = await this.conversations.leave(id, user.userId);
    // Notify every other participant that the conversation is over so their
    // chat screens redirect instead of letting them type into a dead room.
    for (const peerId of peerUserIds) {
      this.realtime.emitToUser(peerId, SocketEvents.CHAT_CONVERSATION_ENDED, {
        conversationId: id,
        reason: 'left',
      });
    }
  }
}
