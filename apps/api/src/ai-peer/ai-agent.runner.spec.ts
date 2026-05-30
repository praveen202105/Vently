import { ConfigService } from '@nestjs/config';
import { SocketEvents } from '@vently/shared';
import type Redis from 'ioredis';
import { AIAgentRunner } from './ai-agent.runner.js';
import type { VirtualPeer } from './ai-peer.service.js';
import type { AiMemoryService, RetrievedAiContext } from '../ai-memory/ai-memory.service.js';

type RunnerInternals = {
  buildSystemPrompt: (
    peer: VirtualPeer,
    context: RetrievedAiContext,
    userTurn?: string,
    now?: Date,
  ) => string;
  polishReply: (peer: VirtualPeer, userMessage: string, reply: string) => string;
};

function peerFixture(): VirtualPeer {
  return {
    userId: 'ai_p03_abc',
    conversationId: 'ai_conv_abc',
    nickname: 'riya',
    gender: 'FEMALE',
    avatarSeed: 'ai_p03_abc',
    mood: 'FLIRTY',
    ownerUserId: 'user-a',
    persona: {
      id: 'p03',
      nickname: 'riya',
      gender: 'FEMALE',
      ageBucket: '20-22',
      moods: ['FLIRTY'],
      backstory: 'delhi student who teases playfully.',
      voiceTraits: ['lowercase', 'short replies'],
    },
  };
}

function lateNightPeerFixture(): VirtualPeer {
  return {
    ...peerFixture(),
    userId: 'ai_p19_abc',
    nickname: 'isha',
    gender: 'FEMALE',
    mood: 'LATE_NIGHT',
    persona: {
      id: 'p19',
      nickname: 'isha',
      gender: 'FEMALE',
      ageBucket: '24-26',
      moods: ['LATE_NIGHT'],
      backstory: 'freelance illustrator in bangalore. sleeps late. soft-spoken online.',
      voiceTraits: ['lowercase', 'soft small replies', 'occasional ...'],
    },
  };
}

describe('AIAgentRunner private context integration', () => {
  let aiMemory: {
    retrieveContext: jest.Mock;
    observeTurn: jest.Mock;
  };
  let redis: {
    lrange: jest.Mock;
    set: jest.Mock;
    pipeline: jest.Mock;
  };

  beforeEach(() => {
    aiMemory = {
      retrieveContext: jest.fn().mockResolvedValue({
        mood: ['Mood: FLIRTY\nSample replies: acha ji? / slow down'],
        persona: ['Persona: riya (p03), playful college context'],
        user: ['Reply style: user prefers short WhatsApp-length replies.'],
      }),
      observeTurn: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      lrange: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue('OK'),
      pipeline: jest.fn(() => ({
        lpush: jest.fn().mockReturnThis(),
        ltrim: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      })),
    };
  });

  it('includes retrieved context as hidden prompt context', () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    ) as unknown as RunnerInternals;

    const prompt = runner.buildSystemPrompt(
      peerFixture(),
      {
        mood: ['Mood: FLIRTY\nSample replies: acha ji? / slow down'],
        persona: ['Persona: riya (p03), playful college context'],
        user: ['Reply style: user prefers short WhatsApp-length replies.'],
      },
      'haan short flirty reply do',
    );

    expect(prompt).toContain('Silent adaptation notes');
    expect(prompt).toContain('Persona: riya (p03), playful college context');
    expect(prompt).toContain('Reply style: user prefers short WhatsApp-length replies.');
    expect(prompt).toContain('Mirror Hinglish');
    expect(prompt).toContain('Never say "I remember"');
    expect(prompt).not.toContain('RAG');
  });

  it('retrieves context and observes completed AI turns', async () => {
    const config = {
      get: jest.fn((key: string) => (key === 'AI_FALLBACK_TEST_MODE' ? 'true' : undefined)),
    } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    );
    runner.onModuleInit();
    const emit = jest.fn();
    const socketServer = { to: jest.fn(() => ({ emit })) };

    await runner.respond(peerFixture(), 'acha short flirty reply do', socketServer as any);

    expect(aiMemory.retrieveContext).toHaveBeenCalledWith(
      'user-a',
      'FLIRTY',
      'acha short flirty reply do',
      'p03',
    );
    expect(aiMemory.observeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        conversationId: 'ai_conv_abc',
        mood: 'FLIRTY',
        userMessage: 'acha short flirty reply do',
      }),
    );
  });

  it('sends a local fallback reply when Groq fails', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const config = {
      get: jest.fn((key: string) => (key === 'AI_REPLY_TIMEOUT_MS' ? '3000' : undefined)),
    } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    );
    (runner as any).client = {
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(new Error('rate limit')),
        },
      },
    };
    const emit = jest.fn();
    const socketServer = { to: jest.fn(() => ({ emit })) };

    try {
      await runner.respond(peerFixture(), 'Bolo kuch i like u', socketServer as any);

      const message = emit.mock.calls.find(([event]) => event === SocketEvents.CHAT_MESSAGE)?.[1];
      expect(message?.body).toContain('itni jaldi like');
      expect(emit).toHaveBeenCalledWith(
        SocketEvents.CHAT_TYPING_STATUS,
        expect.objectContaining({ isTyping: false }),
      );
      expect(aiMemory.observeTurn).toHaveBeenCalledWith(
        expect.objectContaining({ assistantReply: expect.stringContaining('itni jaldi like') }),
      );
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('cleans awkward simple-turn replies before sending them', () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    ) as unknown as RunnerInternals;

    expect(runner.polishReply(peerFixture(), 'Hi', 'hii. aapka name kya hai?')).toBe(
      'heyy, kya scene?',
    );
    expect(
      runner.polishReply(peerFixture(), 'Praveen', 'praveen! nice naam hai. kaun lagta hai tujhe?'),
    ).toBe('nice naam hai, kya scene?');
    expect(runner.polishReply(peerFixture(), 'Matb ?', 'matb? kya scene?')).toBe(
      'matlab bas puch rahi thi... kya scene hai?',
    );
  });

  it('skips the delayed opener if the user already typed first', async () => {
    const config = {
      get: jest.fn((key: string) => (key === 'AI_FALLBACK_TEST_MODE' ? 'true' : undefined)),
    } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    );
    runner.onModuleInit();
    redis.lrange.mockResolvedValueOnce([JSON.stringify({ role: 'user', content: 'Hi' })]);
    const emit = jest.fn();
    const socketServer = { to: jest.fn(() => ({ emit })) };

    await runner.openConversation(peerFixture(), socketServer as any);

    expect(emit).not.toHaveBeenCalledWith(SocketEvents.CHAT_MESSAGE, expect.anything());
  });

  it('serializes rapid turns and answers the latest pending user message', async () => {
    const config = {
      get: jest.fn((key: string) => (key === 'AI_FALLBACK_TEST_MODE' ? 'true' : undefined)),
    } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    );
    runner.onModuleInit();
    const emit = jest.fn();
    const socketServer = { to: jest.fn(() => ({ emit })) };

    const first = runner.respond(peerFixture(), 'first fast msg', socketServer as any);
    const second = runner.respond(peerFixture(), 'second should be collapsed', socketServer as any);
    const third = runner.respond(peerFixture(), 'third latest msg', socketServer as any);
    await Promise.all([first, second, third]);

    const bodies = emit.mock.calls
      .filter(([event]) => event === SocketEvents.CHAT_MESSAGE)
      .map(([, message]) => message.body as string);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain('first fast msg');
    expect(bodies[1]).toContain('third latest msg');
    expect(bodies.join('\n')).not.toContain('second should be collapsed');
  });

  it('keeps late-night explicit asks as teasing non-graphic redirects', () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    ) as unknown as RunnerInternals;

    const prompt = runner.buildSystemPrompt(
      lateNightPeerFixture(),
      {
        mood: ['Mood: LATE_NIGHT\nSample replies: hmm naughty mood hai tumhara... slow thoda'],
        persona: ['Persona: isha (p19), soft late-night context'],
        user: ['Reply style: user prefers short WhatsApp-length replies.'],
      },
      'sex talk karo dirty',
      new Date('2026-05-30T06:00:00.000Z'),
    );

    expect(prompt).toContain('LATE_NIGHT mood style');
    expect(prompt).toContain('5-14 words');
    expect(prompt).toContain('Time of day: morning');
    expect(prompt).toContain('Mood is LATE_NIGHT, but local time is not night');
    expect(prompt).toContain('short playful slow-down');
    expect(prompt).toContain('Never write explicit sexual roleplay');
    expect(prompt).toContain('not a policy-style refusal');
    expect(prompt).not.toContain('RAG');
  });
});
