import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { SocketEvents } from '@vently/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { MatchmakingService } from '../matchmaking/matchmaking.service.js';
import { type AuthedSocket, userRoom } from './types.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: 'USER' | 'MOD' | 'ADMIN';
}

@WebSocketGateway({ cors: { credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  afterInit() {
    this.server.use((socket, next) => {
      // Socket.io auth middleware: verify JWT in handshake.auth.token.
      const token =
        (socket.handshake.auth as { token?: string }).token ??
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) {
        this.logger.warn(`socket auth: missing token (sid=${socket.id})`);
        return next(new Error('Missing auth token'));
      }

      try {
        const payload = this.jwt.verify<JwtPayload>(token, {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
        this.prisma.user
          .findUnique({
            where: { id: payload.sub },
            include: { profile: true },
          })
          .then((user) => {
            if (!user || !user.profile) {
              this.logger.warn(
                `socket auth: profile missing for user ${payload.sub} (sid=${socket.id})`,
              );
              return next(new Error('Profile required before connecting'));
            }
            (socket as AuthedSocket).data.user = {
              userId: user.id,
              email: user.email,
              role: user.role,
              nickname: user.profile.nickname,
              gender: user.profile.gender,
            };
            next();
          })
          .catch((err) => {
            this.logger.error('socket auth: db lookup failed', err);
            next(err as Error);
          });
      } catch (err) {
        this.logger.warn(
          `socket auth: invalid token (sid=${socket.id}): ${(err as Error).message}`,
        );
        next(new Error('Invalid token'));
      }
    });
  }

  async handleConnection(socket: AuthedSocket) {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    void socket.join(userRoom(user.userId));
    await this.presence.markOnline(user.userId);

    this.server.emit(SocketEvents.PRESENCE_ONLINE, { userId: user.userId });
    this.logger.debug(`connected ${user.userId} (${user.nickname})`);
  }

  async handleDisconnect(socket: AuthedSocket) {
    const user = socket.data.user;
    if (!user) return;

    await this.matchmaking.removeFromAllQueues(user.userId);
    await this.presence.markOffline(user.userId);

    this.server.emit(SocketEvents.PRESENCE_OFFLINE, { userId: user.userId });
    this.logger.debug(`disconnected ${user.userId}`);
  }

  /** Emit an event into a specific user's room (all their connected sockets). */
  emitToUser<E extends string, P>(userId: string, event: E, payload: P) {
    this.server?.to(userRoom(userId)).emit(event, payload as never);
  }

  /** Broadcast inside an active conversation room. */
  emitToConversation<E extends string, P>(conversationId: string, event: E, payload: P) {
    this.server?.to(`conv:${conversationId}`).emit(event, payload as never);
  }
}
