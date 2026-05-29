import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SocketEvents } from '@vently/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AIPeerService } from '../ai-peer/ai-peer.service.js';
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
    private readonly aiPeer: AIPeerService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.listForUser(user.userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.conversations.unreadCount(user.userId);
  }

  @Get(':id')
  // Single-conversation metadata. Drives the mood-aware End button on the
  // chat screen ("End" vs "Back to friends") and recovers peer info if the
  // match-store wasn't hydrated (e.g. user opened /chat/[id] directly via a
  // /connections deep link or a refresh).
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.getConversation(id, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (id.startsWith('ai_conv_')) {
      const peer = await this.aiPeer.load(id);
      if (!peer || peer.ownerUserId !== user.userId) {
        throw new NotFoundException('Conversation not found');
      }
      await this.aiPeer.evict(id);
      return;
    }

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
