import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Gender, MoodIntent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { BlocksService } from '../blocks/blocks.service.js';

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

// Lua: atomically check the opposite-gender queue. If it has a ticket, pop the
// oldest one (ZRANGE … 0 0) and ZREM it; return the peerId. Otherwise push our
// own ticket and return nil. Runs as a single Redis operation so two clients
// hitting match:join at the same instant can't both think they're waiting.
const MATCH_SCRIPT = `
local oppQueue = KEYS[1]
local myQueue = KEYS[2]
local userId = ARGV[1]
local now = tonumber(ARGV[2])

local peers = redis.call('ZRANGE', oppQueue, 0, 0)
if #peers > 0 then
  local peerId = peers[1]
  if peerId ~= userId then
    redis.call('ZREM', oppQueue, peerId)
    return peerId
  end
end

redis.call('ZADD', myQueue, now, userId)
return nil
`;

export interface MatchResult {
  status: 'matched' | 'queued';
  conversationId?: string;
  peerUserId?: string;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
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

    // Try up to 3 times in case the first peer is blocked. We re-eval the Lua
    // script each iteration so the work stays atomic per attempt.
    let peerId: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      peerId = (await this.redis.eval(
        MATCH_SCRIPT,
        2,
        oppQueue,
        myQueue,
        args.userId,
        Date.now().toString(),
      )) as string | null;

      if (!peerId) break;

      const blocked = await this.blocks.isBlocked(args.userId, peerId);
      if (!blocked) break;

      // Blocked peer — discard the match and try again. (Their ticket is gone
      // from the queue; if they're still online they'll re-queue on next tick.)
      this.logger.debug(`skipped blocked peer ${peerId} for ${args.userId}`);
      peerId = null;
    }

    if (!peerId) {
      this.logger.debug(`queued ${args.userId} on ${myQueue}`);
      return { status: 'queued' };
    }

    // Match found — create the conversation + participants.
    const convo = await this.prisma.conversation.create({
      data: {
        type: 'DIRECT',
        participants: {
          createMany: {
            data: [{ userId: args.userId }, { userId: peerId }],
          },
        },
      },
    });

    this.logger.log(`matched ${args.userId} ↔ ${peerId} as ${convo.id}`);
    return { status: 'matched', conversationId: convo.id, peerUserId: peerId };
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
