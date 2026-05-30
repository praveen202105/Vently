import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { AIAgentRunner } from './ai-agent.runner.js';
import type { VirtualPeer } from './ai-peer.service.js';
import type { AiMemoryService, RetrievedAiContext } from '../ai-memory/ai-memory.service.js';

type RunnerInternals = {
  buildSystemPrompt: (peer: VirtualPeer, ragContext: RetrievedAiContext) => string;
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

describe('AIAgentRunner RAG integration', () => {
  let aiMemory: {
    retrieveContext: jest.Mock;
    observeTurn: jest.Mock;
  };
  let redis: {
    lrange: jest.Mock;
    pipeline: jest.Mock;
  };

  beforeEach(() => {
    aiMemory = {
      retrieveContext: jest.fn().mockResolvedValue({
        mood: ['Mood: FLIRTY\nSample replies: acha ji? / slow down'],
        user: ['Reply style: user prefers short WhatsApp-length replies.'],
      }),
      observeTurn: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      lrange: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn(() => ({
        lpush: jest.fn().mockReturnThis(),
        ltrim: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      })),
    };
  });

  it('includes retrieved RAG context as soft prompt context', () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const runner = new AIAgentRunner(
      config,
      redis as unknown as Redis,
      aiMemory as unknown as AiMemoryService,
    ) as unknown as RunnerInternals;

    const prompt = runner.buildSystemPrompt(peerFixture(), {
      mood: ['Mood: FLIRTY\nSample replies: acha ji? / slow down'],
      user: ['Reply style: user prefers short WhatsApp-length replies.'],
    });

    expect(prompt).toContain('Retrieved RAG context');
    expect(prompt).toContain('Reply style: user prefers short WhatsApp-length replies.');
    expect(prompt).toContain('Never say "I remember"');
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
});
