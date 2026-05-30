import { SocketEvents } from '@vently/shared';
import { CallsGateway } from './calls.gateway.js';

function makeGateway(options: { peerVisible?: boolean } = {}) {
  const calls = {
    ensureActive: jest.fn().mockResolvedValue({
      conversationId: 'conv-1',
      callerId: 'caller-a',
      calleeId: 'callee-b',
    }),
    findPeer: jest.fn(),
    end: jest.fn(),
  };
  const realtime = { emitToUser: jest.fn() };
  const throttle = { allow: jest.fn().mockReturnValue(true) };
  const focus = { isUserVisible: jest.fn().mockReturnValue(options.peerVisible ?? false) };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const gateway = new CallsGateway(
    calls as any,
    realtime as any,
    throttle as any,
    focus as any,
    push as any,
  );
  const socket = {
    data: { user: { userId: 'caller-a', nickname: 'Ana' } },
  };

  return { gateway, socket, calls, realtime, focus, push };
}

describe('CallsGateway call invite push', () => {
  it('always emits the live socket invite and sends OS push when callee is not visible', async () => {
    const { gateway, socket, realtime, focus, push } = makeGateway({ peerVisible: false });

    await gateway.onInvite(socket as any, {
      conversationId: 'conv-1',
      fromUserId: '',
    });

    expect(realtime.emitToUser).toHaveBeenCalledWith('callee-b', SocketEvents.CALL_INVITE, {
      conversationId: 'conv-1',
      fromUserId: 'caller-a',
    });
    expect(focus.isUserVisible).toHaveBeenCalledWith('callee-b');
    expect(push.sendToUser).toHaveBeenCalledWith('callee-b', {
      title: 'Incoming call',
      body: 'Ana is calling you',
      url: '/call/conv-1?incoming=1',
      tag: 'call:conv-1',
      requireInteraction: true,
    });
  });

  it('does not send duplicate OS push when callee is visibly active', async () => {
    const { gateway, socket, realtime, push } = makeGateway({ peerVisible: true });

    await gateway.onInvite(socket as any, {
      conversationId: 'conv-1',
      fromUserId: '',
    });

    expect(realtime.emitToUser).toHaveBeenCalledWith('callee-b', SocketEvents.CALL_INVITE, {
      conversationId: 'conv-1',
      fromUserId: 'caller-a',
    });
    expect(push.sendToUser).not.toHaveBeenCalled();
  });
});
