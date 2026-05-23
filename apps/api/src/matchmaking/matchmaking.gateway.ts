import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { SocketEvents, type MatchJoinPayload } from '@vently/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthedSocket, convRoom, userRoom } from '../realtime/types.js';
import { MatchmakingService } from './matchmaking.service.js';

@WebSocketGateway({ cors: { credentials: true } })
export class MatchmakingGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(MatchmakingGateway.name);

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly prisma: PrismaService,
  ) {}

  @SubscribeMessage(SocketEvents.MATCH_JOIN)
  async onJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: MatchJoinPayload,
  ) {
    const user = socket.data.user;
    const result = await this.matchmaking.join({
      userId: user.userId,
      gender: user.gender,
      mood: payload.mood,
      preferredGender: payload.preferredGender,
    });

    if (result.status === 'queued') {
      return { ok: true, status: 'queued' };
    }

    // Found a match. Look up peer profile to include in the event payload.
    const peer = await this.prisma.profile.findUnique({
      where: { userId: result.peerUserId! },
      select: { userId: true, nickname: true, gender: true, avatarSeed: true },
    });
    if (!peer) {
      this.logger.warn(`peer profile missing for ${result.peerUserId}`);
      return { ok: false, error: 'Peer not found' };
    }

    const conversationId = result.conversationId!;
    const peerForUser = {
      conversationId,
      peer: {
        userId: peer.userId,
        nickname: peer.nickname,
        gender: peer.gender,
        avatarSeed: peer.avatarSeed,
      },
    };
    const peerForPeer = {
      conversationId,
      peer: {
        userId: user.userId,
        nickname: user.nickname,
        gender: user.gender,
        avatarSeed: '',
      },
    };

    // Tell both sides. We also pre-join both sockets to the conversation room
    // so subsequent chat events route correctly without an explicit chat:join.
    void socket.join(convRoom(conversationId));

    // Hydrate the requester's peer avatarSeed (we already have it).
    this.server.to(userRoom(user.userId)).emit(SocketEvents.MATCH_FOUND, peerForUser);

    // Hydrate the peer's view: fetch the requester's avatarSeed.
    const meProfile = await this.prisma.profile.findUnique({
      where: { userId: user.userId },
      select: { avatarSeed: true },
    });
    if (meProfile) peerForPeer.peer.avatarSeed = meProfile.avatarSeed;

    // Join the peer's existing sockets to the conv room too.
    const peerSockets = await this.server.in(userRoom(result.peerUserId!)).fetchSockets();
    for (const s of peerSockets) {
      void s.join(convRoom(conversationId));
    }
    this.server.to(userRoom(result.peerUserId!)).emit(SocketEvents.MATCH_FOUND, peerForPeer);

    return { ok: true, status: 'matched', conversationId };
  }

  @SubscribeMessage(SocketEvents.MATCH_CANCEL)
  async onCancel(@ConnectedSocket() socket: AuthedSocket) {
    await this.matchmaking.cancel(socket.data.user.userId);
    return { ok: true };
  }
}
