import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  SocketEvents,
  type CallHangupPayload,
  type CallIceCandidatePayload,
  type CallInvitePayload,
  type CallSdpPayload,
} from '@vently/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { type AuthedSocket } from '../realtime/types.js';
import { CallsService } from './calls.service.js';

@WebSocketGateway({ cors: { credentials: true } })
export class CallsGateway {
  private readonly logger = new Logger(CallsGateway.name);

  constructor(
    private readonly calls: CallsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // Caller offers a call → wake the callee.
  @SubscribeMessage(SocketEvents.CALL_INVITE)
  async onInvite(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallInvitePayload,
  ) {
    const caller = socket.data.user;
    const session = await this.calls.ensureActive({
      conversationId: payload.conversationId,
      callerId: caller.userId,
    });
    if (!session) return { ok: false };

    const peerId = session.callerId === caller.userId ? session.calleeId : session.callerId;
    this.realtime.emitToUser(peerId, SocketEvents.CALL_INVITE, {
      conversationId: payload.conversationId,
      fromUserId: caller.userId,
    });
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CALL_ACCEPT)
  async onAccept(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallInvitePayload,
  ) {
    const peerId = await this.calls.findPeer(payload.conversationId, socket.data.user.userId);
    if (peerId) {
      this.realtime.emitToUser(peerId, SocketEvents.CALL_ACCEPT, {
        conversationId: payload.conversationId,
        fromUserId: socket.data.user.userId,
      });
    }
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CALL_REJECT)
  async onReject(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallInvitePayload,
  ) {
    const peerId = await this.calls.findPeer(payload.conversationId, socket.data.user.userId);
    if (peerId) {
      this.realtime.emitToUser(peerId, SocketEvents.CALL_REJECT, {
        conversationId: payload.conversationId,
        fromUserId: socket.data.user.userId,
      });
    }
    await this.calls.end(payload.conversationId, 'rejected');
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CALL_OFFER)
  async onOffer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: CallSdpPayload) {
    const peerId = await this.calls.findPeer(payload.conversationId, socket.data.user.userId);
    if (peerId) this.realtime.emitToUser(peerId, SocketEvents.CALL_OFFER, payload);
  }

  @SubscribeMessage(SocketEvents.CALL_ANSWER)
  async onAnswer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: CallSdpPayload) {
    const peerId = await this.calls.findPeer(payload.conversationId, socket.data.user.userId);
    if (peerId) this.realtime.emitToUser(peerId, SocketEvents.CALL_ANSWER, payload);
  }

  @SubscribeMessage(SocketEvents.CALL_ICE_CANDIDATE)
  async onIceCandidate(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallIceCandidatePayload,
  ) {
    const peerId = await this.calls.findPeer(payload.conversationId, socket.data.user.userId);
    if (peerId) this.realtime.emitToUser(peerId, SocketEvents.CALL_ICE_CANDIDATE, payload);
  }

  @SubscribeMessage(SocketEvents.CALL_HANGUP)
  async onHangup(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallHangupPayload,
  ) {
    const peerId = await this.calls.findPeer(payload.conversationId, socket.data.user.userId);
    if (peerId) this.realtime.emitToUser(peerId, SocketEvents.CALL_HANGUP, payload);
    await this.calls.end(payload.conversationId, payload.reason ?? 'hangup');
  }
}
