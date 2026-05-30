import { SocketEvents } from '@vently/shared';
import { ChatGateway } from './chat.gateway.js';

function makeGateway() {
  const conversations = { assertParticipant: jest.fn().mockResolvedValue(undefined) };
  const messages = {
    send: jest.fn(async ({ conversationId, senderId, body, replyToMessageId }) => ({
      id: 'msg-1',
      conversationId,
      senderId,
      body,
      type: 'TEXT',
      createdAt: new Date().toISOString(),
      deletedAt: null,
      reactions: [],
      readReceiptAt: null,
      replyToMessageId: replyToMessageId ?? null,
      replyToBody: null,
    })),
  };
  const blocks = { isBlocked: jest.fn().mockResolvedValue(false) };
  const moderation = {
    inspectMessage: jest.fn(() => ({ severity: 'CLEAN', match: '' })),
    logRejection: jest.fn().mockResolvedValue(undefined),
    flagMessage: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    conversationParticipant: {
      findFirst: jest.fn().mockResolvedValue({ userId: 'peer-b' }),
    },
    profile: {
      findUnique: jest.fn().mockResolvedValue({ mood: 'FRIENDSHIP' }),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const throttle = { allow: jest.fn().mockReturnValue(true) };
  const focus = { isFocusedOn: jest.fn().mockReturnValue(true) };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const suggestions = { generate: jest.fn().mockResolvedValue(undefined) };
  const aiPeer = { load: jest.fn() };
  const aiAgent = {
    openConversation: jest.fn(),
    recordUserMessage: jest.fn(),
    respond: jest.fn(),
  };
  const aiMemory = { observeUserMessage: jest.fn().mockResolvedValue(undefined) };

  const gateway = new ChatGateway(
    conversations as any,
    messages as any,
    blocks as any,
    moderation as any,
    prisma as any,
    throttle as any,
    focus as any,
    push as any,
    suggestions as any,
    aiPeer as any,
    aiAgent as any,
    aiMemory as any,
  );

  const socket = {
    data: { user: { userId: 'user-a', nickname: 'ana' } },
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  };

  return { gateway, socket, moderation, aiMemory, messages };
}

describe('ChatGateway personalization observation', () => {
  it('observes clean human chat from the sender only after persistence', async () => {
    const { gateway, socket, aiMemory, messages } = makeGateway();

    await gateway.onSend(socket as any, {
      conversationId: 'conv-human',
      clientId: 'client-1',
      body: 'haan yaar breakup scene hai',
    });

    expect(messages.send).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(SocketEvents.CHAT_ACK, {
      clientId: 'client-1',
      messageId: 'msg-1',
    });
    expect(aiMemory.observeUserMessage).toHaveBeenCalledWith({
      userId: 'user-a',
      conversationId: 'conv-human',
      mood: 'FRIENDSHIP',
      body: 'haan yaar breakup scene hai',
      moderationSeverity: 'CLEAN',
    });
  });

  it('does not observe mild, severe, or audio payloads', async () => {
    const mild = makeGateway();
    mild.moderation.inspectMessage.mockReturnValue({ severity: 'MILD', match: 'x' });
    await mild.gateway.onSend(mild.socket as any, {
      conversationId: 'conv-human',
      clientId: 'client-1',
      body: 'mild word',
    });
    expect(mild.aiMemory.observeUserMessage).not.toHaveBeenCalled();

    const severe = makeGateway();
    severe.moderation.inspectMessage.mockReturnValue({ severity: 'SEVERE', match: 'x' });
    await severe.gateway.onSend(severe.socket as any, {
      conversationId: 'conv-human',
      clientId: 'client-2',
      body: 'severe word',
    });
    expect(severe.aiMemory.observeUserMessage).not.toHaveBeenCalled();
    expect(severe.messages.send).not.toHaveBeenCalled();

    const audio = makeGateway();
    await audio.gateway.onSend(audio.socket as any, {
      conversationId: 'conv-human',
      clientId: 'client-3',
      body: 'audio:data',
    });
    expect(audio.aiMemory.observeUserMessage).not.toHaveBeenCalled();
  });
});
