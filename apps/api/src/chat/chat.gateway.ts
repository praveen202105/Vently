import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import {
  SocketEvents,
  type ChatDeletePayload,
  type ChatReadPayload,
  type ChatSendPayload,
  type ChatTypingPayload,
} from '@vently/shared';
import { randomUUID } from 'crypto';
import { ConversationsService } from '../conversations/conversations.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthedSocket, convRoom } from '../realtime/types.js';
import { SocketThrottleService } from '../realtime/socket-throttle.service.js';
import { FocusService } from '../realtime/focus.service.js';
import { PushService } from '../push/push.service.js';
import { SuggestionsService } from '../suggestions/suggestions.service.js';
import { AIPeerService } from '../ai-peer/ai-peer.service.js';
import { AIAgentRunner } from '../ai-peer/ai-agent.runner.js';

const MAX_BODY_LEN = 2000;
// Per-user-per-event caps. Values are deliberately generous so a real
// conversation never trips them; they exist to stop scripted spam.
const SEND_LIMIT = 30;
const SEND_WINDOW_MS = 10_000; // 30 messages / 10s = 3/sec average
const TYPING_LIMIT = 60;
const TYPING_WINDOW_MS = 10_000; // generous; client debounces to ~1/3s anyway
const READ_LIMIT = 30;
const READ_WINDOW_MS = 10_000;

@WebSocketGateway({ cors: { credentials: true } })
export class ChatGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly blocks: BlocksService,
    private readonly moderation: ModerationService,
    private readonly prisma: PrismaService,
    private readonly throttle: SocketThrottleService,
    private readonly focus: FocusService,
    private readonly push: PushService,
    private readonly suggestions: SuggestionsService,
    private readonly aiPeer: AIPeerService,
    private readonly aiAgent: AIAgentRunner,
  ) {}

  // Lets a reconnected/refreshed client re-join its conversation room.
  @SubscribeMessage(SocketEvents.CHAT_JOIN)
  async onJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    // AI conversations have no DB-backed Conversation row, so the regular
    // participant assertion would throw. Allow the user to join the room
    // iff Redis still has the AI session active (60min TTL).
    if (payload.conversationId.startsWith('ai_conv_')) {
      const peer = await this.aiPeer.load(payload.conversationId);
      if (!peer || peer.ownerUserId !== socket.data.user.userId) {
        return { ok: false, error: 'Conversation no longer available' };
      }
      void socket.join(convRoom(payload.conversationId));
      return { ok: true };
    }
    await this.conversations.assertParticipant(payload.conversationId, socket.data.user.userId);
    void socket.join(convRoom(payload.conversationId));
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CHAT_SEND)
  async onSend(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: ChatSendPayload) {
    const body = (payload.body ?? '').trim();
    const isAudio = body.startsWith('audio:');
    const maxLen = isAudio ? 2_000_000 : MAX_BODY_LEN;
    if (!body || body.length > maxLen) return { ok: false, error: 'Invalid body' };

    const user = socket.data.user;

    if (!this.throttle.allow(user.userId, 'chat:send', SEND_LIMIT, SEND_WINDOW_MS)) {
      return { ok: false, error: 'Slow down — sending too fast' };
    }

    // AI fallback conversations are ephemeral: no DB rows, no moderation
    // log writes, no suggestions/push. Shunt early so the regular DB-backed
    // pipeline below is untouched.
    if (payload.conversationId.startsWith('ai_conv_')) {
      return this.handleAIMessage(socket, payload, body);
    }

    // Membership check FIRST — without this, an attacker who knows a
    // conversationId could send messages to a conversation they're not in.
    // The block check below only verifies the peer hasn't blocked the
    // attacker; it doesn't verify the attacker belongs in the room at all.
    await this.conversations.assertParticipant(payload.conversationId, user.userId);

    // Block-check + mood lookup — run in parallel, both are cheap PK queries.
    const [peer, senderProfile] = await Promise.all([
      this.prisma.conversationParticipant.findFirst({
        where: { conversationId: payload.conversationId, userId: { not: user.userId } },
        select: { userId: true },
      }),
      this.prisma.profile.findUnique({
        where: { userId: user.userId },
        select: { mood: true },
      }),
    ]);
    if (peer) {
      const blocked = await this.blocks.isBlocked(user.userId, peer.userId);
      if (blocked) return { ok: false, error: 'Cannot send to this user' };
    }

    // Profanity check — severe terms are rejected outright; mild get flagged
    // after persist. Bypassed for audio base64 streams.
    const profanity = isAudio
      ? { severity: 'CLEAN' as const, match: '' }
      : this.moderation.inspectMessage(body);
    if (profanity.severity === 'SEVERE') {
      await this.moderation.logRejection(user.userId, body, profanity);
      return { ok: false, error: 'Message violates content policy' };
    }

    const msg = await this.messages.send({
      conversationId: payload.conversationId,
      senderId: user.userId,
      body,
      replyToMessageId: payload.replyToMessageId,
    });

    // Acknowledge the sender (optimistic UI swaps client message with server one).
    socket.emit(SocketEvents.CHAT_ACK, { clientId: payload.clientId, messageId: msg.id });

    if (profanity.severity === 'MILD') {
      void this.moderation.flagMessage(msg.id, profanity, 'allowed');
    }

    // Fan out to other room members.
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_MESSAGE, msg);

    // Also send to self so other open tabs of the sender see it.
    socket.emit(SocketEvents.CHAT_MESSAGE, msg);

    // Smart reply suggestions — fire for the peer only, never block delivery.
    // Fetch up to 3 recent messages (excluding the one just sent) so Groq can
    // generate context-aware chips that make sense in the thread.
    if (peer) {
      void (async () => {
        let recentMessages: { senderId: string; body: string; isFromSender: boolean }[] | undefined;
        try {
          const recent = await this.prisma.message.findMany({
            where: {
              conversationId: payload.conversationId,
              deletedAt: null,
              id: { not: msg.id },
              type: 'TEXT',
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { senderId: true, body: true },
          });
          // Reverse so oldest-first, mark each as from-sender (peer) or not (viewer).
          recentMessages = recent.reverse().map((m) => ({
            senderId: m.senderId,
            body: m.body,
            isFromSender: m.senderId === user.userId,
          }));
        } catch {
          // Best-effort — if the DB call fails, fall back to single-message mode.
        }
        void this.suggestions.generate({
          conversationId: payload.conversationId,
          lastMessage: body,
          mood: senderProfile?.mood ?? null,
          forUserId: peer.userId,
          socketServer: this.server,
          recentMessages,
        });
      })();
    }

    // Web push to the peer — only if they're NOT currently focused on this
    // conversation. The socket-level CHAT_MESSAGE above already handles the
    // in-app case; push is the OS-level wake-up when the tab is backgrounded
    // or closed. Fire-and-forget so the chat:send response isn't blocked on
    // the push service.
    if (peer) {
      const peerFocused = this.focus.isFocusedOn(peer.userId, payload.conversationId);
      if (!peerFocused) {
        const preview = body.length > 80 ? `${body.slice(0, 77)}…` : body;
        void this.push.sendToUser(peer.userId, {
          title: user.nickname,
          body: preview,
          url: `/chat/${payload.conversationId}`,
          // Tag groups consecutive messages from the same conversation into
          // one OS notification instead of N pings during an active burst.
          tag: `chat:${payload.conversationId}`,
        });
      }
    }

    return { ok: true, messageId: msg.id };
  }

  @SubscribeMessage(SocketEvents.CHAT_TYPING)
  async onTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: ChatTypingPayload,
  ) {
    const userId = socket.data.user.userId;
    if (!this.throttle.allow(userId, 'chat:typing', TYPING_LIMIT, TYPING_WINDOW_MS)) return;
    // AI conversations have no DB rows; skip assertParticipant. The AI peer
    // doesn't care about the user's typing state, but we still bounce it to
    // the room so multi-tab UX stays consistent.
    if (!payload.conversationId.startsWith('ai_conv_')) {
      await this.conversations.assertParticipant(payload.conversationId, userId);
    }
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_TYPING_STATUS, {
      ...payload,
      userId,
    });
  }

  @SubscribeMessage(SocketEvents.CHAT_READ)
  async onRead(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: ChatReadPayload) {
    const userId = socket.data.user.userId;
    if (!this.throttle.allow(userId, 'chat:read', READ_LIMIT, READ_WINDOW_MS)) return;
    // AI conversations: no MessageReceipt rows to persist, no peer to notify.
    // Silently no-op so the client's auto-read pings don't spam errors.
    if (payload.conversationId.startsWith('ai_conv_')) return;
    await this.conversations.assertParticipant(payload.conversationId, userId);
    await this.messages.markRead({ ...payload, userId });
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_READ_STATUS, {
      ...payload,
      userId,
    });
  }

  /** Delete a message for all participants in the conversation. */
  @SubscribeMessage(SocketEvents.CHAT_DELETE)
  async onDelete(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: ChatDeletePayload,
  ) {
    // No DB-backed messages for AI conversations, nothing to soft-delete.
    if (payload.conversationId.startsWith('ai_conv_')) {
      return { ok: false, error: 'Cannot delete in this conversation' };
    }
    const userId = socket.data.user.userId;
    const result = await this.messages.deleteForEveryone({
      messageId: payload.messageId,
      requesterId: userId,
      conversationId: payload.conversationId,
    });
    return result;
  }

  /**
   * AI-conversation hot path. Skips DB persist + suggestions + push. Echoes
   * the user's message back via CHAT_MESSAGE (so the UI renders identically
   * to a real chat), records it in Redis history, then fires the agent
   * response loop.
   */
  private async handleAIMessage(
    socket: AuthedSocket,
    payload: ChatSendPayload,
    body: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const user = socket.data.user;
    const peer = await this.aiPeer.load(payload.conversationId);
    if (!peer || peer.ownerUserId !== user.userId) {
      return { ok: false, error: 'Conversation no longer available' };
    }

    // Profanity check is still useful so we don't feed obvious slurs to Groq.
    const profanity = this.moderation.inspectMessage(body);
    if (profanity.severity === 'SEVERE') {
      return { ok: false, error: 'Message violates content policy' };
    }

    const msg = {
      id: randomUUID(),
      conversationId: payload.conversationId,
      senderId: user.userId,
      body,
      type: 'TEXT' as const,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      replyToMessageId: payload.replyToMessageId ?? null,
    };

    socket.emit(SocketEvents.CHAT_ACK, { clientId: payload.clientId, messageId: msg.id });
    socket.emit(SocketEvents.CHAT_MESSAGE, msg);
    // Other tabs of the same user receive it via the room broadcast.
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_MESSAGE, msg);

    void this.aiAgent.recordUserMessage(payload.conversationId, body);
    // Fire-and-forget so the user's ack isn't blocked on Groq latency.
    void this.aiAgent.respond(peer, body, this.server);

    return { ok: true, messageId: msg.id };
  }
}
