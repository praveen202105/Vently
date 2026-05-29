import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { SocketEvents, type MatchJoinPayload } from '@vently/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthedSocket, convRoom, userRoom } from '../realtime/types.js';
import { MatchmakingService } from './matchmaking.service.js';
import { IcebreakerService } from '../icebreaker/icebreaker.service.js';
import { AIPeerService } from '../ai-peer/ai-peer.service.js';
import { AIAgentRunner } from '../ai-peer/ai-agent.runner.js';

@WebSocketGateway({ cors: { credentials: true } })
export class MatchmakingGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(MatchmakingGateway.name);

  // Per-user pending AI-fallback timers. Cleared when the user cancels match,
  // disconnects, or a real match lands first.
  private readonly aiFallbackTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly prisma: PrismaService,
    private readonly icebreaker: IcebreakerService,
    private readonly aiPeer: AIPeerService,
    private readonly aiAgent: AIAgentRunner,
    private readonly config: ConfigService,
  ) {}

  @SubscribeMessage(SocketEvents.MATCH_JOIN)
  async onJoin(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: MatchJoinPayload) {
    const user = socket.data.user;
    const result = await this.matchmaking.join({
      userId: user.userId,
      gender: user.gender,
      mood: payload.mood,
      preferredGender: payload.preferredGender,
    });

    if (result.status === 'queued') {
      this.scheduleAIFallback(socket, payload);
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
    // Both sides queue under the same (mood, gender) — they pop from the same
    // queue, so payload.mood is authoritative for the pair.
    const peerForUser = {
      conversationId,
      peer: {
        userId: peer.userId,
        nickname: peer.nickname,
        gender: peer.gender,
        avatarSeed: peer.avatarSeed,
      },
      mood: payload.mood,
      lastMetAt: result.lastMetAt?.toISOString() ?? null,
    };
    const peerForPeer = {
      conversationId,
      peer: {
        userId: user.userId,
        nickname: user.nickname,
        gender: user.gender,
        avatarSeed: '',
      },
      mood: payload.mood,
      lastMetAt: result.lastMetAt?.toISOString() ?? null,
    };

    // Tell both sides. We also pre-join both sockets to the conversation room
    // so subsequent chat events route correctly without an explicit chat:join.
    void socket.join(convRoom(conversationId));

    // The peer was waiting in queue — if their AI fallback timer hasn't fired
    // yet, cancel it now so we don't double-match them.
    this.cancelAIFallback(result.peerUserId!);

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

    // Fire-and-forget — never awaited so the match response is not delayed.
    void this.icebreaker.generate({
      conversationId,
      userAId: user.userId,
      userBId: result.peerUserId!,
      mood: payload.mood,
      socketServer: this.server,
    });

    return { ok: true, status: 'matched', conversationId };
  }

  @SubscribeMessage(SocketEvents.MATCH_CANCEL)
  async onCancel(@ConnectedSocket() socket: AuthedSocket) {
    this.cancelAIFallback(socket.data.user.userId);
    await this.matchmaking.cancel(socket.data.user.userId);
    return { ok: true };
  }

  handleDisconnect(socket: AuthedSocket) {
    const userId = socket.data?.user?.userId;
    if (userId) this.cancelAIFallback(userId);
  }

  /**
   * After the user is queued, start a one-shot timer. If they're still in the
   * queue when it fires, pair them with an AI fallback peer instead of
   * leaving them staring at the waiting screen.
   *
   * Skipped for VOICE_ONLY (AI can't do voice) and when AI_FALLBACK_ENABLED
   * is not set to "true".
   */
  private scheduleAIFallback(socket: AuthedSocket, payload: MatchJoinPayload) {
    const enabled = this.config.get<string>('AI_FALLBACK_ENABLED') === 'true';
    if (!enabled) return;
    if (payload.mood === 'VOICE_ONLY') return;
    if (!this.aiAgent.isReady()) return;

    const user = socket.data.user;
    const delay = Number(this.config.get<string>('AI_FALLBACK_MS')) || 8_000;

    // If a previous timer was already set (e.g. user re-joined without
    // cancelling), replace it.
    this.cancelAIFallback(user.userId);

    const timer = setTimeout(async () => {
      this.aiFallbackTimers.delete(user.userId);
      try {
        const stillQueued = await this.matchmaking.removeFromQueueIfPresent(
          user.userId,
          payload.mood,
          user.gender,
        );
        if (!stillQueued) return; // a real match landed first

        const virtualPeer = await this.aiPeer.spawn({
          userId: user.userId,
          mood: payload.mood,
          preferredGender: payload.preferredGender,
          myGender: user.gender,
        });
        if (!virtualPeer) {
          // Spawn refused (rate-limited or no persona). Re-queue the user so
          // they still have a chance at a real match — they just don't get
          // the AI fallback this round.
          await this.matchmaking.join({
            userId: user.userId,
            gender: user.gender,
            mood: payload.mood,
            preferredGender: payload.preferredGender,
          });
          return;
        }

        void socket.join(convRoom(virtualPeer.conversationId));

        this.server.to(userRoom(user.userId)).emit(SocketEvents.MATCH_FOUND, {
          conversationId: virtualPeer.conversationId,
          peer: {
            userId: virtualPeer.userId,
            nickname: virtualPeer.nickname,
            gender: virtualPeer.gender,
            avatarSeed: virtualPeer.avatarSeed,
          },
          mood: payload.mood,
          lastMetAt: null,
          isAIChat: true,
        });

        // Open the conversation with a greeting after a humanlike delay.
        void this.aiAgent.openConversation(virtualPeer, this.server);

        this.logger.log(
          `AI fallback fired for ${user.userId} mood=${payload.mood} persona=${virtualPeer.persona.id}`,
        );
      } catch (err) {
        this.logger.error(`AI fallback failed for ${user.userId}: ${(err as Error).message}`);
      }
    }, delay);

    this.aiFallbackTimers.set(user.userId, timer);
  }

  private cancelAIFallback(userId: string) {
    const existing = this.aiFallbackTimers.get(userId);
    if (existing) {
      clearTimeout(existing);
      this.aiFallbackTimers.delete(userId);
    }
  }
}
