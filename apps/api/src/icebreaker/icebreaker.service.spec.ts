import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocketEvents } from '@vently/shared';
import { IcebreakerService } from './icebreaker.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStream(chunks: string[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of chunks) {
        yield { choices: [{ delta: { content: text } }] };
      }
    },
  };
}

function makeSocketServer() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { server: { to }, emit, to };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BASE_PARAMS = {
  conversationId: 'conv-1',
  userAId: 'user-a',
  userBId: 'user-b',
  mood: 'LONELY' as const,
};

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('IcebreakerService', () => {
  let service: IcebreakerService;
  let prisma: {
    profile: { findUnique: jest.Mock };
    conversation: { findUnique: jest.Mock };
    message: { create: jest.Mock };
  };
  let moderation: { inspectMessage: jest.Mock };
  let groqCreate: jest.Mock;

  beforeEach(async () => {
    groqCreate = jest.fn();

    prisma = {
      profile: { findUnique: jest.fn().mockResolvedValue({ bio: null }) },
      conversation: { findUnique: jest.fn().mockResolvedValue({ endedAt: null }) },
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-a',
          body: '',
          type: 'SYSTEM',
          createdAt: new Date(),
        }),
      },
    };

    moderation = {
      inspectMessage: jest.fn().mockReturnValue({ severity: 'CLEAN', match: null }),
    };

    const module = await Test.createTestingModule({
      providers: [
        IcebreakerService,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'GROQ_API_KEY' ? 'test-key' : undefined) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();

    service = module.get(IcebreakerService);
    await service.onModuleInit();

    // Inject a mock Groq client directly — avoids jest.mock hoisting issues
    // while still exercising all real service logic.
    (service as any).client = {
      chat: { completions: { create: groqCreate } },
    };
  });

  it('emits chunks and done, then persists SYSTEM message', async () => {
    groqCreate.mockResolvedValue(makeStream(['Both ', 'of ', 'you…']));
    const { server, to, emit } = makeSocketServer();

    await service.generate({ ...BASE_PARAMS, socketServer: server as any });

    expect(to).toHaveBeenCalledWith('conv:conv-1');

    const chunkCalls = emit.mock.calls.filter(([e]) => e === SocketEvents.CHAT_ICEBREAKER_CHUNK);
    expect(chunkCalls).toHaveLength(3);
    expect(chunkCalls.map(([, p]) => p.chunk)).toEqual(['Both ', 'of ', 'you…']);

    expect(emit.mock.calls.some(([e]) => e === SocketEvents.CHAT_MESSAGE)).toBe(true);
    expect(emit.mock.calls.some(([e]) => e === SocketEvents.CHAT_ICEBREAKER_DONE)).toBe(true);

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv-1',
        type: 'SYSTEM',
        body: 'Both of you…',
      }),
    });
  });

  it('is a no-op when GROQ_API_KEY is missing', async () => {
    (service as any).client = null; // simulate no key configured
    const { server, emit } = makeSocketServer();
    await service.generate({ ...BASE_PARAMS, socketServer: server as any });
    expect(emit).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('skips VOICE_ONLY matches entirely', async () => {
    const { server, emit } = makeSocketServer();
    await service.generate({ ...BASE_PARAMS, mood: 'VOICE_ONLY' as any, socketServer: server as any });
    expect(emit).not.toHaveBeenCalled();
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it('does not throw or persist when Groq stream throws', async () => {
    groqCreate.mockRejectedValue(new Error('network error'));
    const { server, emit } = makeSocketServer();
    await expect(
      service.generate({ ...BASE_PARAMS, socketServer: server as any }),
    ).resolves.toBeUndefined();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([e]) => e === SocketEvents.CHAT_ICEBREAKER_DONE)).toBe(false);
  });

  it('does not emit or persist when accumulated text is empty', async () => {
    groqCreate.mockResolvedValue(makeStream(['   ']));
    const { server, emit } = makeSocketServer();
    await service.generate({ ...BASE_PARAMS, socketServer: server as any });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([e]) => e === SocketEvents.CHAT_ICEBREAKER_DONE)).toBe(false);
  });

  it('discards output when moderation returns SEVERE', async () => {
    groqCreate.mockResolvedValue(makeStream(['badword content']));
    moderation.inspectMessage.mockReturnValue({ severity: 'SEVERE', match: 'badword' });
    const { server, emit } = makeSocketServer();
    await service.generate({ ...BASE_PARAMS, socketServer: server as any });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([e]) => e === SocketEvents.CHAT_ICEBREAKER_DONE)).toBe(false);
  });

  it('aborts persist when conversation already ended', async () => {
    groqCreate.mockResolvedValue(makeStream(['Some ice-breaker']));
    prisma.conversation.findUnique.mockResolvedValue({ endedAt: new Date() });
    const { server, emit } = makeSocketServer();
    await service.generate({ ...BASE_PARAMS, socketServer: server as any });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([e]) => e === SocketEvents.CHAT_ICEBREAKER_DONE)).toBe(false);
  });

  it('strips email PII from bio before sending to Groq', async () => {
    prisma.profile.findUnique
      .mockResolvedValueOnce({ bio: 'email me at test@example.com' })
      .mockResolvedValueOnce({ bio: null });
    groqCreate.mockResolvedValue(makeStream(['Hi there']));
    const { server } = makeSocketServer();

    await service.generate({ ...BASE_PARAMS, socketServer: server as any });

    const call = groqCreate.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    const userMsg = call.messages.find((m) => m.role === 'user')!.content;
    expect(userMsg).not.toContain('test@example.com');
    expect(userMsg).toContain('[email]');
  });
});
