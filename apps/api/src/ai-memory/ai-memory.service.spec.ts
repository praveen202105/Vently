import type Redis from 'ioredis';
import { AiRagKind, AiRagScope, type MoodIntent } from '@prisma/client';
import { AiMemoryService } from './ai-memory.service.js';

function makeRedis() {
  const lists = new Map<string, string[]>();
  return {
    pipeline: jest.fn(() => {
      const commands: Array<() => void> = [];
      const pipeline: {
        lpush: jest.Mock;
        ltrim: jest.Mock;
        expire: jest.Mock;
        exec: jest.Mock;
      } = {
        lpush: jest.fn((key: string, value: string) => {
          commands.push(() => lists.set(key, [value, ...(lists.get(key) ?? [])]));
          return pipeline;
        }),
        ltrim: jest.fn((key: string, start: number, stop: number) => {
          commands.push(() => lists.set(key, (lists.get(key) ?? []).slice(start, stop + 1)));
          return pipeline;
        }),
        expire: jest.fn(() => pipeline),
        exec: jest.fn(async () => {
          commands.forEach((command) => command());
          return [];
        }),
      };
      return pipeline;
    }),
    lrange: jest.fn(async (key: string, start: number, stop: number) =>
      (lists.get(key) ?? []).slice(start, stop + 1),
    ),
  };
}

function makeService() {
  const preferences = new Map<string, { userId: string; enabled: boolean; updatedAt: Date }>();
  const chunks: any[] = [];
  const prisma = {
    aiMemoryPreference: {
      findUnique: jest.fn(async ({ where }: any) => preferences.get(where.userId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = preferences.get(where.userId);
        const next = {
          userId: where.userId,
          enabled: existing ? update.enabled : create.enabled,
          updatedAt: new Date(),
        };
        preferences.set(where.userId, next);
        return next;
      }),
    },
    aiRagChunk: {
      count: jest.fn(
        async ({ where }: any) =>
          chunks.filter(
            (chunk) =>
              chunk.userId === where.userId &&
              chunk.scope === where.scope &&
              (!chunk.expiresAt || chunk.expiresAt > new Date()),
          ).length,
      ),
      findFirst: jest.fn(
        async ({ where }: any) =>
          chunks.find((chunk) => chunk.userId === where.userId && chunk.scope === where.scope) ??
          null,
      ),
      findMany: jest.fn(async ({ where }: any) => {
        const expiresAfter = where.OR?.find((entry: any) => entry.expiresAt?.gt)?.expiresAt.gt;
        const fresh = (chunk: any) =>
          !expiresAfter || chunk.expiresAt === null || chunk.expiresAt > expiresAfter;
        if (where.scope === AiRagScope.MOOD_TEMPLATE) {
          return chunks.filter(
            (chunk) => chunk.scope === where.scope && chunk.mood === where.mood && fresh(chunk),
          );
        }
        if (where.scope === AiRagScope.PERSONA_TEMPLATE) {
          const prefix = where.sourceKey?.startsWith;
          return chunks.filter(
            (chunk) =>
              chunk.scope === where.scope &&
              (!prefix || chunk.sourceKey?.startsWith(prefix)) &&
              fresh(chunk),
          );
        }
        return chunks.filter(
          (chunk) => chunk.scope === where.scope && chunk.userId === where.userId && fresh(chunk),
        );
      }),
      findUnique: jest.fn(
        async ({ where }: any) =>
          chunks.find((chunk) => chunk.sourceKey === where.sourceKey) ?? null,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const index = chunks.findIndex((chunk) => chunk.sourceKey === where.sourceKey);
        if (index >= 0) {
          chunks[index] = { ...chunks[index], ...update, updatedAt: new Date() };
          return chunks[index];
        }
        const created = {
          id: `chunk-${chunks.length + 1}`,
          updatedAt: new Date(),
          createdAt: new Date(),
          ...create,
        };
        chunks.push(created);
        return created;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        let deleted = 0;
        for (let i = chunks.length - 1; i >= 0; i -= 1) {
          if (chunks[i].userId === where.userId && chunks[i].scope === where.scope) {
            chunks.splice(i, 1);
            deleted += 1;
          }
        }
        return { count: deleted };
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const embedding = {
    generate: jest.fn(async (text: string) => {
      if (text.includes('relationship') || text.includes('breakup')) return [1, 0];
      if (text.includes('work')) return [0, 1];
      return [0.5, 0.5];
    }),
    cosineSimilarity: jest.fn((a: number[], b: number[]) => {
      const dot = a.reduce((sum, val, i) => sum + val * (b[i] ?? 0), 0);
      const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
      return dot / (normA * normB);
    }),
    textSimilarity: jest.fn((a: string, b: string) => (b.includes(a) ? 1 : 0)),
  };
  const redis = makeRedis();
  const service = new AiMemoryService(prisma as any, embedding as any, redis as unknown as Redis);
  return { service, prisma, embedding, chunks, preferences };
}

describe('AiMemoryService', () => {
  it('defaults missing preferences to enabled', async () => {
    const { service } = makeService();

    const status = await service.getStatus('user-a');

    expect(status.enabled).toBe(true);
  });

  it('does not observe turns while memory is disabled', async () => {
    const { service, chunks } = makeService();
    await service.setEnabled('user-a', false);

    await service.observeTurn({
      userId: 'user-a',
      conversationId: 'ai_conv_a',
      mood: 'FRIENDSHIP',
      userMessage: 'haan short reply dena',
      assistantReply: 'haan sure',
    });

    expect(chunks).toHaveLength(0);
  });

  it('does not observe human chat while personalization is disabled', async () => {
    const { service, chunks } = makeService();
    await service.setEnabled('user-a', false);

    await service.observeUserMessage({
      userId: 'user-a',
      conversationId: 'conv-a',
      mood: 'FRIENDSHIP',
      body: 'haan short reply dena',
      moderationSeverity: 'CLEAN',
    });

    expect(chunks).toHaveLength(0);
  });

  it('enables memory and reports status', async () => {
    const { service } = makeService();

    const status = await service.setEnabled('user-a', true);

    expect(status.enabled).toBe(true);
    expect(status.retentionDays).toBe(90);
  });

  it('stores safe distilled memory signals with embeddings', async () => {
    const { service, chunks } = makeService();

    await service.observeTurn({
      userId: 'user-a',
      conversationId: 'ai_conv_a',
      mood: 'LATE_NIGHT',
      userMessage: 'haan neend nahi aa rhi, short reply dena',
      assistantReply: 'hmm, raat heavy lag rhi?',
    });

    expect(chunks.some((chunk) => chunk.scope === AiRagScope.USER_MEMORY)).toBe(true);
    expect(chunks.map((chunk) => chunk.content).join('\n')).toContain('Hinglish');
    expect(chunks.every((chunk) => Array.isArray(chunk.embedding))).toBe(true);
  });

  it('observes normal human chat for the sender only', async () => {
    const { service, chunks } = makeService();

    await service.observeUserMessage({
      userId: 'sender-a',
      conversationId: 'conv-human',
      mood: 'FRIENDSHIP',
      body: 'haan yaar short reply dena, breakup scene hai',
      moderationSeverity: 'CLEAN',
    });

    expect(chunks.some((chunk) => chunk.userId === 'sender-a')).toBe(true);
    expect(chunks.some((chunk) => chunk.userId === 'peer-b')).toBe(false);
    expect(chunks.every((chunk) => chunk.metadata?.source === 'HUMAN_CHAT')).toBe(true);
  });

  it('skips unsafe or non-clean user messages', async () => {
    const { service, chunks } = makeService();

    await service.observeUserMessage({
      userId: 'user-a',
      conversationId: 'conv-human',
      mood: 'FLIRTY',
      body: 'nude bhejo',
      moderationSeverity: 'CLEAN',
    });
    await service.observeUserMessage({
      userId: 'user-a',
      conversationId: 'conv-human',
      mood: 'NEED_TO_TALK',
      body: 'my email is test@example.com',
      moderationSeverity: 'CLEAN',
    });
    await service.observeUserMessage({
      userId: 'user-a',
      conversationId: 'conv-human',
      mood: 'FRIENDSHIP',
      body: 'fuck this',
      moderationSeverity: 'MILD',
    });
    await service.observeUserMessage({
      userId: 'user-a',
      conversationId: 'conv-human',
      mood: 'FRIENDSHIP',
      body: 'audio:data',
      moderationSeverity: 'CLEAN',
    });

    expect(chunks).toHaveLength(0);
  });

  it('ranks semantically relevant chunks above unrelated chunks', async () => {
    const { service, chunks } = makeService();
    chunks.push(
      chunkFixture('relationship memory', 'user-a', 'USER_MEMORY', 'FRIENDSHIP', [1, 0]),
      chunkFixture('work memory', 'user-a', 'USER_MEMORY', 'FRIENDSHIP', [0, 1]),
    );

    const context = await service.retrieveContext('user-a', 'FRIENDSHIP', 'breakup relationship');

    expect(context.user[0]).toBe('relationship memory');
  });

  it('ignores user memory when disabled but still returns mood templates', async () => {
    const { service, chunks } = makeService();
    await service.setEnabled('user-a', false);
    chunks.push(
      chunkFixture('friendship tone', null, 'MOOD_TEMPLATE', 'FRIENDSHIP', [1, 0]),
      chunkFixture('private user memory', 'user-a', 'USER_MEMORY', 'FRIENDSHIP', [1, 0]),
    );

    const context = await service.retrieveContext('user-a', 'FRIENDSHIP', 'breakup relationship');

    expect(context.mood).toEqual(['friendship tone']);
    expect(context.user).toEqual([]);
  });

  it('retrieves persona story chunks for the current persona', async () => {
    const { service, chunks } = makeService();
    chunks.push(
      chunkFixture(
        'Persona: riya (p03), playful college context',
        null,
        'PERSONA_TEMPLATE',
        null,
        [1, 0],
        'persona:1:p03:profile',
      ),
      chunkFixture(
        'Persona: kavya (p01), quiet late night context',
        null,
        'PERSONA_TEMPLATE',
        null,
        [1, 0],
        'persona:1:p01:profile',
      ),
    );

    const context = await service.retrieveContext('user-a', 'FLIRTY', 'college crush', 'p03');

    expect(context.persona).toEqual(['Persona: riya (p03), playful college context']);
  });

  it('seeds persona story templates', async () => {
    const { service, chunks } = makeService();

    await service.seedPersonaTemplates();

    expect(
      chunks.some(
        (chunk) =>
          chunk.scope === AiRagScope.PERSONA_TEMPLATE &&
          chunk.kind === AiRagKind.PERSONA_STORY &&
          chunk.sourceKey === 'persona:1:p03:profile',
      ),
    ).toBe(true);
  });

  it('filters expired chunks during retrieval', async () => {
    const { service, chunks, prisma } = makeService();
    chunks.push(chunkFixture('fresh memory', 'user-a', 'USER_MEMORY', 'FRIENDSHIP', [1, 0]), {
      ...chunkFixture('expired memory', 'user-a', 'USER_MEMORY', 'FRIENDSHIP', [1, 0]),
      expiresAt: new Date(Date.now() - 1_000),
    });

    const context = await service.retrieveContext('user-a', 'FRIENDSHIP', 'relationship');

    expect(prisma.aiRagChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
    expect(context.user).toEqual(['fresh memory']);
  });

  it('clears only the current user memory and disables preference', async () => {
    const { service, chunks } = makeService();
    await service.setEnabled('user-a', true);
    chunks.push(
      chunkFixture('mine', 'user-a', 'USER_MEMORY', 'FRIENDSHIP', [1, 0]),
      chunkFixture('other', 'user-b', 'USER_MEMORY', 'FRIENDSHIP', [1, 0]),
    );

    await service.clear('user-a');
    const status = await service.getStatus('user-a');

    expect(status.enabled).toBe(false);
    expect(chunks.map((chunk) => chunk.content)).toEqual(['other']);
  });
});

function chunkFixture(
  content: string,
  userId: string | null,
  scope: keyof typeof AiRagScope,
  mood: MoodIntent | null,
  embedding: number[],
  sourceKey = content,
) {
  return {
    id: content,
    scope: AiRagScope[scope],
    userId,
    mood,
    kind:
      scope === 'MOOD_TEMPLATE'
        ? AiRagKind.TONE_EXAMPLE
        : scope === 'PERSONA_TEMPLATE'
          ? AiRagKind.PERSONA_STORY
          : AiRagKind.USER_SIGNAL,
    content,
    embedding,
    metadata: null,
    sourceConversationId: null,
    sourceKey,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
