import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Gender, MoodIntent } from '@prisma/client';
import { REDIS_CLIENT } from '../redis/redis.module.js';

export interface Persona {
  id: string;
  nickname: string;
  gender: Gender;
  ageBucket: string;
  moods: MoodIntent[];
  backstory: string;
  voiceTraits: string[];
}

export interface VirtualPeer {
  userId: `ai_${string}`;
  conversationId: string;
  nickname: string;
  gender: Gender;
  avatarSeed: string;
  persona: Persona;
  mood: MoodIntent;
  ownerUserId: string;
}

interface SpawnArgs {
  userId: string;
  mood: MoodIntent;
  preferredGender?: Gender;
  myGender: Gender;
}

const RATE_LIMIT_WINDOW_SEC = 600; // 10min: 1 AI session per user per window

/**
 * Factory + registry for AI fallback peers. Picks a persona matching the
 * requester's mood + preferred gender, mints a virtual `ai_<persona>_<rand>`
 * userId + conversationId, and stores the runtime context in Redis with a
 * 60-minute TTL so the agent loop can reload state across socket reconnects.
 *
 * Nothing here writes to the Conversation / Message tables — AI chats are
 * ephemeral by design.
 */
@Injectable()
export class AIPeerService {
  private readonly logger = new Logger(AIPeerService.name);
  private readonly personas: Persona[];

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    // personas.json sits next to this file. Both src (dev) and dist (prod)
    // layouts keep them co-located so a single relative path works in both.
    // Use __dirname (CommonJS) rather than import.meta.url since NestJS's
    // tsconfig targets CommonJS module mode.
    const raw = readFileSync(join(__dirname, 'personas.json'), 'utf8');
    this.personas = JSON.parse(raw) as Persona[];
    this.logger.log(`Loaded ${this.personas.length} AI personas`);
  }

  /**
   * Returns true if this user is already throttled out of AI fallback for the
   * cooldown window. Cap is 1 AI session / user / 10min so a viral spike
   * doesn't burn Groq quota.
   */
  async isRateLimited(userId: string): Promise<boolean> {
    const key = `aichat:rl:${userId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Pick a persona and mint a virtual peer. Returns null when no persona
   * matches (rare — only possible if a brand-new mood was added without
   * seeding personas).
   */
  async spawn(args: SpawnArgs): Promise<VirtualPeer | null> {
    if (await this.isRateLimited(args.userId)) {
      this.logger.debug(`user ${args.userId} is AI-throttled`);
      return null;
    }

    const targetGender: Gender =
      args.preferredGender ?? (args.myGender === 'MALE' ? 'FEMALE' : 'MALE');

    const candidates = this.personas.filter(
      (p) => p.gender === targetGender && p.moods.includes(args.mood),
    );
    if (candidates.length === 0) {
      this.logger.warn(
        `No AI persona matches mood=${args.mood} gender=${targetGender} — fallback skipped`,
      );
      return null;
    }

    const persona = candidates[Math.floor(Math.random() * candidates.length)]!;
    const rand = randomBytes(4).toString('hex');
    const userId = `ai_${persona.id}_${rand}` as `ai_${string}`;
    const conversationId = `ai_conv_${rand}_${Date.now().toString(36)}`;

    const peer: VirtualPeer = {
      userId,
      conversationId,
      nickname: persona.nickname,
      gender: persona.gender,
      // Use the userId as the avatar seed so dicebear renders something stable
      // for the whole session without us needing to seed an avatar field.
      avatarSeed: userId,
      persona,
      mood: args.mood,
      ownerUserId: args.userId,
    };

    // Two Redis keys:
    //   aichat:conv:{conversationId} -> JSON-encoded VirtualPeer (60min TTL)
    //   aichat:rl:{userId}            -> throttle marker (10min TTL)
    await Promise.all([
      this.redis.set(`aichat:conv:${conversationId}`, JSON.stringify(peer), 'EX', 3600),
      this.redis.set(`aichat:rl:${args.userId}`, '1', 'EX', RATE_LIMIT_WINDOW_SEC),
    ]);

    this.logger.log(
      `Spawned AI peer ${userId} (persona=${persona.id}) for user ${args.userId} on conv ${conversationId}`,
    );
    return peer;
  }

  /** True when conversationId points at an active AI chat. Fast path used by chat/calls/friends gates. */
  async isAIConversation(conversationId: string): Promise<boolean> {
    if (!conversationId.startsWith('ai_conv_')) return false;
    const key = `aichat:conv:${conversationId}`;
    return (await this.redis.exists(key)) === 1;
  }

  /** Load the virtual peer context for an active AI conversation. Null if expired/missing. */
  async load(conversationId: string): Promise<VirtualPeer | null> {
    if (!conversationId.startsWith('ai_conv_')) return null;
    const raw = await this.redis.get(`aichat:conv:${conversationId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as VirtualPeer;
    } catch {
      return null;
    }
  }

  /** Convenience: is THIS peer userId an AI peer? Checks the prefix only. */
  static isAIPeerId(userId: string | null | undefined): boolean {
    return !!userId && userId.startsWith('ai_');
  }

  /** Hard-evict an AI conversation. Called on socket disconnect or hangup. */
  async evict(conversationId: string): Promise<void> {
    if (!conversationId.startsWith('ai_conv_')) return;
    await this.redis.del(`aichat:conv:${conversationId}`);
    // History key (managed by AIAgentRunner) is evicted too.
    await this.redis.del(`aichat:hist:${conversationId}`);
    await this.redis.del(`aichat:greeted:${conversationId}`);
    this.logger.debug(`Evicted AI conv ${conversationId}`);
  }
}
