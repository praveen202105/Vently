import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Gender, MoodIntent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { EmbeddingService } from '../profiles/embedding.service.js';

const GENDERS: Gender[] = ['MALE', 'FEMALE'];
const MOODS: MoodIntent[] = [
  'LONELY',
  'NEED_TO_TALK',
  'FRIENDSHIP',
  'LATE_NIGHT',
  'ADVICE',
  'FLIRTY',
  'VOICE_ONLY',
];

function queueKey(mood: MoodIntent, gender: Gender) {
  return `queue:${mood}:${gender}`;
}

function getHourSet(start: number, end: number): Set<number> {
  const hours = new Set<number>();
  const normalizedEnd = end % 24;
  const normalizedStart = start % 24;

  if (normalizedStart === normalizedEnd) {
    for (let h = 0; h < 24; h++) hours.add(h);
    return hours;
  }

  let h = normalizedStart;
  while (h !== normalizedEnd) {
    hours.add(h);
    h = (h + 1) % 24;
  }
  return hours;
}

export interface MatchResult {
  status: 'matched' | 'queued';
  conversationId?: string;
  peerUserId?: string;
  lastMetAt?: Date | null;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly embedding: EmbeddingService,
  ) {}

  async join(args: {
    userId: string;
    gender: Gender;
    mood: MoodIntent;
    preferredGender?: Gender;
  }): Promise<MatchResult> {
    const oppositeGender: Gender =
      args.preferredGender ?? (args.gender === 'MALE' ? 'FEMALE' : 'MALE');

    const myQueue = queueKey(args.mood, args.gender);
    const oppQueue = queueKey(args.mood, oppositeGender);

    // Make sure we don't have stale tickets in our own queue from a prior session.
    await this.redis.zrem(myQueue, args.userId);

    // 1. Retrieve candidates: Get up to 10 candidates in the opposite queue.
    const candidates: string[] = await this.redis.zrange(oppQueue, 0, 9);

    if (candidates.length === 0) {
      this.logger.debug(`no candidates, queued ${args.userId} on ${myQueue}`);
      await this.redis.zadd(myQueue, Date.now(), args.userId);
      return { status: 'queued' };
    }

    // 2. Fetch profiles for current user and candidates to calculate scores.
    const [myProfile, candidateProfiles] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId: args.userId } }),
      this.prisma.profile.findMany({ where: { userId: { in: candidates } } }),
    ]);

    if (!myProfile) {
      this.logger.debug(`current user profile missing, queued ${args.userId}`);
      await this.redis.zadd(myQueue, Date.now(), args.userId);
      return { status: 'queued' };
    }

    // 3. Compute matchmaking scores
    const scoredCandidates: Array<{
      peerId: string;
      score: number;
      lastMetAt?: Date | null;
    }> = [];

    for (const peerProfile of candidateProfiles) {
      const peerId = peerProfile.userId;

      // Concurrency safety check: make sure user is not trying to match with themselves
      if (peerId === args.userId) continue;

      // Check if blocked
      const blocked = await this.blocks.isBlocked(args.userId, peerId);
      if (blocked) continue;

      // A. Bio Similarity Score (Weight: 40%)
      let bioScore = 0.5; // neutral fallback
      if (myProfile.bioEmbedding && peerProfile.bioEmbedding) {
        bioScore = this.embedding.cosineSimilarity(
          myProfile.bioEmbedding as number[],
          peerProfile.bioEmbedding as number[],
        );
      } else if (myProfile.bio && peerProfile.bio) {
        bioScore = this.embedding.textSimilarity(myProfile.bio, peerProfile.bio);
      }

      // B. Active Hours Overlap (Weight: 30%)
      const myHours = getHourSet(myProfile.activeStartHour, myProfile.activeEndHour);
      const peerHours = getHourSet(peerProfile.activeStartHour, peerProfile.activeEndHour);
      const intersection = new Set([...myHours].filter((x) => peerHours.has(x)));
      const hoursScore = intersection.size / Math.min(myHours.size, peerHours.size);

      // C. Past Interaction Boost (Weight: 30%)
      const pastConvos = await this.prisma.conversation.findMany({
        where: {
          type: 'DIRECT',
          AND: [
            { participants: { some: { userId: args.userId } } },
            { participants: { some: { userId: peerId } } },
          ],
        },
        include: {
          _count: {
            select: { messages: true },
          },
        },
      });

      const totalMessages = pastConvos.reduce((sum, c) => sum + c._count.messages, 0);
      const interactionScore = Math.min(totalMessages / 20, 1.0);

      // Total compatibility score
      const score = 0.4 * bioScore + 0.3 * hoursScore + 0.3 * interactionScore;

      // Extract lastMetAt from past direct conversations
      const lastMetAt =
        pastConvos.length > 0
          ? pastConvos
              .map((c) => c.endedAt)
              .filter(Boolean)
              .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null
          : null;

      scoredCandidates.push({ peerId, score, lastMetAt });
    }

    // 4. Sort candidates by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // 5. Atomic pop: try to atomically claim the highest-scoring candidate
    let matchedPeer: { peerId: string; lastMetAt?: Date | null } | null = null;
    for (const candidate of scoredCandidates) {
      const removed = await this.redis.zrem(oppQueue, candidate.peerId);
      if (removed === 1) {
        // Successfully locked this peer!
        matchedPeer = { peerId: candidate.peerId, lastMetAt: candidate.lastMetAt };
        break;
      }
    }

    if (!matchedPeer) {
      // All candidates were either claimed or none qualified; queue current user
      this.logger.debug(`no valid/free candidates, queued ${args.userId} on ${myQueue}`);
      await this.redis.zadd(myQueue, Date.now(), args.userId);
      return { status: 'queued' };
    }

    // 6. Match found — create the conversation + participants.
    const convo = await this.prisma.conversation.create({
      data: {
        type: 'DIRECT',
        participants: {
          createMany: {
            data: [{ userId: args.userId }, { userId: matchedPeer.peerId }],
          },
        },
      },
    });

    this.logger.log(
      `matched ${args.userId} ↔ ${matchedPeer.peerId} as ${convo.id} with compatibility score`,
    );
    return {
      status: 'matched',
      conversationId: convo.id,
      peerUserId: matchedPeer.peerId,
      lastMetAt: matchedPeer.lastMetAt ?? null,
    };
  }

  async cancel(userId: string) {
    return this.removeFromAllQueues(userId);
  }

  async removeFromAllQueues(userId: string) {
    const pipeline = this.redis.pipeline();
    for (const mood of MOODS) {
      for (const gender of GENDERS) {
        pipeline.zrem(queueKey(mood, gender), userId);
      }
    }
    await pipeline.exec();
  }
}
