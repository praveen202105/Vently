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
import { SocketThrottleService } from '../realtime/socket-throttle.service.js';
import { FocusService } from '../realtime/focus.service.js';
import { PushService } from '../push/push.service.js';
import { CallsService } from './calls.service.js';

// Caps for the noisy signaling events. Invite is human-paced so 3/min is
// plenty; the SDP/ICE flow is bursty (~30 candidates in the first second)
// but bounded — 50 per 10s tolerates a chatty TURN relay without letting an
// attacker DoS via candidate spam.
const INVITE_LIMIT = 3;
const INVITE_WINDOW_MS = 60_000;
const SIGNAL_LIMIT = 50;
const SIGNAL_WINDOW_MS = 10_000;

@WebSocketGateway({ cors: { credentials: true } })
export class CallsGateway {
  private readonly logger = new Logger(CallsGateway.name);

  constructor(
    private readonly calls: CallsService,
    private readonly realtime: RealtimeGateway,
    private readonly throttle: SocketThrottleService,
    private readonly focus: FocusService,
    private readonly push: PushService,
  ) {}

  // Caller offers a call → wake the callee.
  @SubscribeMessage(SocketEvents.CALL_INVITE)
  async onInvite(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallInvitePayload,
  ) {
    const caller = socket.data.user;
    if (!this.throttle.allow(caller.userId, 'call:invite', INVITE_LIMIT, INVITE_WINDOW_MS)) {
      return { ok: false, error: 'Too many call attempts — wait a minute' };
    }

    // AI peers can't do voice — reject immediately and emit CALL_REJECT so
    // the caller's UI shows a clean "peer unavailable" state.
    if (payload.conversationId.startsWith('ai_conv_')) {
      this.realtime.emitToUser(caller.userId, SocketEvents.CALL_REJECT, {
        conversationId: payload.conversationId,
        fromUserId: 'system',
      });
      return { ok: false, error: 'Peer is unavailable for calls' };
    }

    const session = await this.calls.ensureActive({
      conversationId: payload.conversationId,
      callerId: caller.userId,
    });
    if (!session) return { ok: false };

    const peerId = session.callerId === caller.userId ? session.calleeId : session.callerId;
    const mode = payload.mode === 'video' ? 'video' : 'voice';
    this.realtime.emitToUser(peerId, SocketEvents.CALL_INVITE, {
      conversationId: payload.conversationId,
      fromUserId: caller.userId,
      mode,
    });
    if (!this.focus.isUserVisible(peerId)) {
      void this.push.sendToUser(peerId, {
        title: mode === 'video' ? 'Incoming video call' : 'Incoming call',
        body:
          mode === 'video'
            ? `${caller.nickname} is video calling you`
            : `${caller.nickname} is calling you`,
        url:
          mode === 'video'
            ? `/call/${payload.conversationId}?incoming=1&mode=video`
            : `/call/${payload.conversationId}?incoming=1`,
        tag: `call:${payload.conversationId}`,
        requireInteraction: true,
      });
    }
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
        mode: payload.mode === 'video' ? 'video' : 'voice',
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
        mode: payload.mode === 'video' ? 'video' : 'voice',
      });
    }
    await this.calls.end(payload.conversationId, 'rejected');
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CALL_OFFER)
  async onOffer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: CallSdpPayload) {
    const userId = socket.data.user.userId;
    if (!this.throttle.allow(userId, 'call:offer', SIGNAL_LIMIT, SIGNAL_WINDOW_MS)) return;
    const peerId = await this.calls.findPeer(payload.conversationId, userId);
    if (peerId) this.realtime.emitToUser(peerId, SocketEvents.CALL_OFFER, payload);
  }

  @SubscribeMessage(SocketEvents.CALL_ANSWER)
  async onAnswer(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: CallSdpPayload) {
    const userId = socket.data.user.userId;
    if (!this.throttle.allow(userId, 'call:answer', SIGNAL_LIMIT, SIGNAL_WINDOW_MS)) return;
    const peerId = await this.calls.findPeer(payload.conversationId, userId);
    if (peerId) this.realtime.emitToUser(peerId, SocketEvents.CALL_ANSWER, payload);
  }

  @SubscribeMessage(SocketEvents.CALL_ICE_CANDIDATE)
  async onIceCandidate(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() payload: CallIceCandidatePayload,
  ) {
    const userId = socket.data.user.userId;
    if (!this.throttle.allow(userId, 'call:ice', SIGNAL_LIMIT, SIGNAL_WINDOW_MS)) return;
    const peerId = await this.calls.findPeer(payload.conversationId, userId);
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
