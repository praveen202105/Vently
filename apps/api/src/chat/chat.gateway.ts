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
  type ChatReadPayload,
  type ChatSendPayload,
  type ChatTypingPayload,
} from '@vently/shared';
import { ConversationsService } from '../conversations/conversations.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { type AuthedSocket, convRoom } from '../realtime/types.js';

const MAX_BODY_LEN = 2000;

@WebSocketGateway({ cors: { credentials: true } })
export class ChatGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  // Lets a reconnected/refreshed client re-join its conversation room.
  @SubscribeMessage(SocketEvents.CHAT_JOIN)
  async onJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    await this.conversations.assertParticipant(payload.conversationId, socket.data.user.userId);
    void socket.join(convRoom(payload.conversationId));
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CHAT_SEND)
  async onSend(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: ChatSendPayload,
  ) {
    const body = (payload.body ?? '').trim();
    if (!body || body.length > MAX_BODY_LEN) return { ok: false, error: 'Invalid body' };

    const user = socket.data.user;
    const msg = await this.messages.send({
      conversationId: payload.conversationId,
      senderId: user.userId,
      body,
    });

    // Acknowledge the sender (optimistic UI swaps client message with server one).
    socket.emit(SocketEvents.CHAT_ACK, { clientId: payload.clientId, messageId: msg.id });

    // Fan out to other room members.
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_MESSAGE, msg);

    // Also send to self so other open tabs of the sender see it.
    socket.emit(SocketEvents.CHAT_MESSAGE, msg);

    return { ok: true, messageId: msg.id };
  }

  @SubscribeMessage(SocketEvents.CHAT_TYPING)
  async onTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: ChatTypingPayload,
  ) {
    await this.conversations.assertParticipant(payload.conversationId, socket.data.user.userId);
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_TYPING_STATUS, {
      ...payload,
      userId: socket.data.user.userId,
    });
  }

  @SubscribeMessage(SocketEvents.CHAT_READ)
  async onRead(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: ChatReadPayload,
  ) {
    const userId = socket.data.user.userId;
    await this.conversations.assertParticipant(payload.conversationId, userId);
    await this.messages.markRead({ ...payload, userId });
    socket.to(convRoom(payload.conversationId)).emit(SocketEvents.CHAT_READ_STATUS, {
      ...payload,
      userId,
    });
  }
}
