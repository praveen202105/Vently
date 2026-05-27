import { Test } from '@nestjs/testing';
import { MatchmakingService } from './matchmaking.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { EmbeddingService } from '../profiles/embedding.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

describe('MatchmakingService', () => {
  let service: MatchmakingService;
  let redis: {
    zrem: jest.Mock;
    zrange: jest.Mock;
    zadd: jest.Mock;
    pipeline: jest.Mock;
  };
  let prisma: {
    profile: { findUnique: jest.Mock; findMany: jest.Mock };
    conversation: { create: jest.Mock; findMany: jest.Mock };
  };
  let blocks: { isBlocked: jest.Mock };
  let embedding: { cosineSimilarity: jest.Mock; textSimilarity: jest.Mock };

  beforeEach(async () => {
    redis = {
      zrem: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue([]),
      zadd: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn(),
    };

    prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-a',
          activeStartHour: 0,
          activeEndHour: 24,
          bio: 'I love books and programming',
          bioEmbedding: [0.1, 0.2],
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversation: {
        create: jest.fn().mockResolvedValue({ id: 'convo-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    blocks = {
      isBlocked: jest.fn().mockResolvedValue(false),
    };

    embedding = {
      cosineSimilarity: jest.fn().mockReturnValue(0.8),
      textSimilarity: jest.fn().mockReturnValue(0.7),
    };

    const module = await Test.createTestingModule({
      providers: [
        MatchmakingService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: PrismaService, useValue: prisma },
        { provide: BlocksService, useValue: blocks },
        { provide: EmbeddingService, useValue: embedding },
      ],
    }).compile();

    service = module.get(MatchmakingService);
  });

  it('queues user when opposite queue is empty', async () => {
    redis.zrange.mockResolvedValue([]);

    const result = await service.join({
      userId: 'user-a',
      gender: 'MALE',
      mood: 'LONELY',
    });

    expect(result.status).toBe('queued');
    expect(redis.zadd).toHaveBeenCalledWith('queue:LONELY:MALE', expect.any(Number), 'user-a');
  });

  it('computes smart scores and matches with highest-scoring available candidate', async () => {
    // 2 candidates in opposite queue
    redis.zrange.mockResolvedValue(['peer-high', 'peer-low']);

    // Set up profiles for candidates
    prisma.profile.findMany.mockResolvedValue([
      {
        userId: 'peer-high',
        activeStartHour: 0,
        activeEndHour: 24,
        bio: 'Coding books',
        bioEmbedding: [0.1, 0.25],
      },
      {
        userId: 'peer-low',
        activeStartHour: 10,
        activeEndHour: 12, // smaller overlap
        bio: 'Hiking outside',
        bioEmbedding: [0.8, -0.9],
      },
    ]);

    // peer-high similarity = 0.95, peer-low = 0.2
    embedding.cosineSimilarity
      .mockReturnValueOnce(0.95) // peer-high
      .mockReturnValueOnce(0.2); // peer-low

    // Try to pop peer-high first, mock that ZREM succeeds
    redis.zrem.mockResolvedValue(1);

    const result = await service.join({
      userId: 'user-a',
      gender: 'MALE',
      mood: 'LONELY',
    });

    expect(result.status).toBe('matched');
    expect(result.peerUserId).toBe('peer-high');
    expect(result.conversationId).toBe('convo-1');

    // Asserts atomic zrem was run first on peer-high
    expect(redis.zrem).toHaveBeenCalledWith('queue:LONELY:FEMALE', 'peer-high');
  });

  it('gracefully skips blocked candidates and picks the next best', async () => {
    redis.zrange.mockResolvedValue(['peer-blocked', 'peer-good']);

    prisma.profile.findMany.mockResolvedValue([
      {
        userId: 'peer-blocked',
        activeStartHour: 0,
        activeEndHour: 24,
        bio: 'Hiking outside',
        bioEmbedding: [0.1, 0.2],
      },
      {
        userId: 'peer-good',
        activeStartHour: 0,
        activeEndHour: 24,
        bio: 'Coding books',
        bioEmbedding: [0.1, 0.2],
      },
    ]);

    // peer-blocked is indeed blocked
    blocks.isBlocked.mockImplementation(async (me, them) => them === 'peer-blocked');

    const result = await service.join({
      userId: 'user-a',
      gender: 'MALE',
      mood: 'LONELY',
    });

    expect(result.status).toBe('matched');
    expect(result.peerUserId).toBe('peer-good');
    expect(redis.zrem).toHaveBeenCalledWith('queue:LONELY:FEMALE', 'peer-good');
  });

  it('retries next candidate when primary choice is grabbed by another matching thread (ZREM returns 0)', async () => {
    redis.zrange.mockResolvedValue(['peer-busy', 'peer-free']);

    prisma.profile.findMany.mockResolvedValue([
      {
        userId: 'peer-busy',
        activeStartHour: 0,
        activeEndHour: 24,
        bio: 'Hiking outside',
        bioEmbedding: [0.1, 0.2],
      },
      {
        userId: 'peer-free',
        activeStartHour: 0,
        activeEndHour: 24,
        bio: 'Coding books',
        bioEmbedding: [0.1, 0.2],
      },
    ]);

    // peer-busy ZREM fails (0), peer-free ZREM succeeds (1)
    redis.zrem
      .mockResolvedValueOnce(1) // from zrem of current user
      .mockResolvedValueOnce(0) // zrem of peer-busy (fails)
      .mockResolvedValueOnce(1); // zrem of peer-free (succeeds)

    const result = await service.join({
      userId: 'user-a',
      gender: 'MALE',
      mood: 'LONELY',
    });

    expect(result.status).toBe('matched');
    expect(result.peerUserId).toBe('peer-free');
  });
});
