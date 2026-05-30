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
const SESSION_TTL_SEC = 3600;

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
    const active = await this.findActiveForUser(args.userId);
    if (active) {
      this.logger.debug(
        `Reusing active AI peer ${active.userId} for user ${args.userId} on conv ${active.conversationId}`,
      );
      return active;
    }

    if (await this.isRateLimited(args.userId)) {
      const legacyActive = await this.findActiveForUser(args.userId, { scanLegacySessions: true });
      if (legacyActive) {
        this.logger.debug(
          `Recovered active AI peer ${legacyActive.userId} for user ${args.userId} on conv ${legacyActive.conversationId}`,
        );
        return legacyActive;
      }
      this.logger.warn(`Clearing stale AI throttle for ${args.userId}`);
      await this.redis.del(`aichat:rl:${args.userId}`);
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
    //   aichat:user:{userId}         -> active AI conversationId (60min TTL)
    //   aichat:rl:{userId}            -> throttle marker (10min TTL)
    await Promise.all([
      this.redis.set(`aichat:conv:${conversationId}`, JSON.stringify(peer), 'EX', SESSION_TTL_SEC),
      this.redis.set(`aichat:user:${args.userId}`, conversationId, 'EX', SESSION_TTL_SEC),
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

  /**
   * Return the user's active AI conversation if one still exists. The direct
   * user index is new; the scan fallback recovers sessions created by older
   * deploys so users are not stuck behind an orphaned throttle.
   */
  async findActiveForUser(
    userId: string,
    options: { scanLegacySessions?: boolean } = {},
  ): Promise<VirtualPeer | null> {
    const userKey = `aichat:user:${userId}`;
    const indexedConversationId = await this.redis.get(userKey);
    if (indexedConversationId) {
      const indexedPeer = await this.load(indexedConversationId);
      if (indexedPeer?.ownerUserId === userId) return indexedPeer;
      await this.redis.del(userKey);
    }
    if (!options.scanLegacySessions) return null;

    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'aichat:conv:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (!raw) continue;
        try {
          const peer = JSON.parse(raw) as VirtualPeer;
          if (peer.ownerUserId !== userId) continue;
          const ttl = await this.redis.ttl(key);
          await this.redis.set(userKey, peer.conversationId, 'EX', ttl > 0 ? ttl : SESSION_TTL_SEC);
          return peer;
        } catch {
          // Ignore malformed legacy entries and keep scanning.
        }
      }
    } while (cursor !== '0');

    return null;
  }

  /** Convenience: is THIS peer userId an AI peer? Checks the prefix only. */
  static isAIPeerId(userId: string | null | undefined): boolean {
    return !!userId && userId.startsWith('ai_');
  }

  /** Hard-evict an AI conversation after the user ends it. */
  async evict(conversationId: string): Promise<void> {
    if (!conversationId.startsWith('ai_conv_')) return;
    const peer = await this.load(conversationId);
    const keys = [
      `aichat:conv:${conversationId}`,
      // History key (managed by AIAgentRunner) is evicted too.
      `aichat:hist:${conversationId}`,
      `aichat:greeted:${conversationId}`,
    ];
    if (peer?.ownerUserId) {
      // Ending the AI chat should let the same user search again immediately.
      keys.push(`aichat:rl:${peer.ownerUserId}`);
      keys.push(`aichat:user:${peer.ownerUserId}`);
    }
    await this.redis.del(...keys);
    this.logger.debug(`Evicted AI conv ${conversationId}`);
  }
}
