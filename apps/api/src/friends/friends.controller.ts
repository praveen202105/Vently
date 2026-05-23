import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SocketEvents } from '@vently/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { FriendsService } from './friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFriendRequestDto, RespondFriendRequestDto } from './dto/friend-request.dto.js';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.listFriends(user.userId);
  }

  @Get('requests')
  incoming(@CurrentUser() user: AuthUser) {
    return this.friends.listIncomingRequests(user.userId);
  }

  @Post('requests')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateFriendRequestDto) {
    const result = await this.friends.sendRequest(user.userId, dto.toUserId);

    if (result.kind === 'requested') {
      const profile = await this.prisma.profile.findUnique({
        where: { userId: user.userId },
        select: { nickname: true },
      });
      this.realtime.emitToUser(dto.toUserId, SocketEvents.FRIEND_REQUEST, {
        requestId: result.request.id,
        fromUserId: user.userId,
        fromNickname: profile?.nickname ?? '',
      });
    } else if (result.kind === 'accepted') {
      this.realtime.emitToUser(result.request.fromUserId, SocketEvents.FRIEND_RESPOND, {
        requestId: result.request.id,
        accepted: true,
        byUserId: user.userId,
      });
    }

    return result;
  }

  @Patch('requests/:id')
  async respond(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RespondFriendRequestDto,
  ) {
    const result = await this.friends.respond(user.userId, id, dto.accept);
    this.realtime.emitToUser(result.request.fromUserId, SocketEvents.FRIEND_RESPOND, {
      requestId: result.request.id,
      accepted: result.kind === 'accepted',
      byUserId: user.userId,
    });
    if (result.kind === 'accepted' && result.conversationId) {
      // Push the SYSTEM message live into the chat room.
      const msg = await this.prisma.message.findFirst({
        where: { conversationId: result.conversationId, type: 'SYSTEM' },
        orderBy: { createdAt: 'desc' },
      });
      if (msg) {
        this.realtime.emitToConversation(result.conversationId, SocketEvents.CHAT_MESSAGE, {
          id: msg.id,
          conversationId: msg.conversationId,
          senderId: msg.senderId,
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
        });
      }
    }
    return result;
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.friends.cancelRequest(user.userId, id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfriend(@CurrentUser() user: AuthUser, @Param('userId') friendUserId: string) {
    await this.friends.unfriend(user.userId, friendUserId);
  }
}
