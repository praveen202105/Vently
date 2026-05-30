import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiRagKind, AiRagScope, Prisma, type AiRagChunk, type MoodIntent } from '@prisma/client';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { EmbeddingService } from '../profiles/embedding.service.js';

export const AI_MEMORY_RETENTION_DAYS = 90;

const USER_MEMORY_TTL_MS = AI_MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const RECENT_TURN_CAP = 8;
const RECENT_TURN_TTL_SEC = 7 * 24 * 60 * 60;
const TOP_MOOD_CHUNKS = 4;
const TOP_USER_CHUNKS = 4;
const CANDIDATE_LIMIT = 80;

interface ToneExample {
  id: string;
  tags: string[];
  userIntent: string;
  sampleReplies: string[];
}

interface TonePack {
  intent: string;
  rules: string[];
  boundaries: string[];
  examples: ToneExample[];
}

interface TonePackFile {
  version: number;
  moods: Partial<Record<MoodIntent, TonePack>>;
}

interface RecentTurn {
  user: string;
  assistant: string;
  mood: MoodIntent;
  at: string;
}

interface MemorySignal {
  content: string;
  mood: MoodIntent | null;
  reason: string;
}

export interface RetrievedAiContext {
  mood: string[];
  user: string[];
}

export interface ObserveAiTurnArgs {
  userId: string;
  conversationId: string;
  mood: MoodIntent;
  userMessage: string;
  assistantReply: string;
}

@Injectable()
export class AiMemoryService implements OnModuleInit {
  private readonly logger = new Logger(AiMemoryService.name);
  private readonly tonePacks: TonePackFile;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.tonePacks = this.loadTonePacks();
  }

  onModuleInit() {
    void this.seedMoodTemplates().catch((err) => {
      this.logger.warn(`AI mood RAG seed failed: ${(err as Error).message}`);
    });
  }

  async getStatus(userId: string) {
    const [preference, chunkCount, latestChunk] = await Promise.all([
      this.prisma.aiMemoryPreference.findUnique({ where: { userId } }),
      this.prisma.aiRagChunk.count({
        where: {
          userId,
          scope: AiRagScope.USER_MEMORY,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      this.prisma.aiRagChunk.findFirst({
        where: { userId, scope: AiRagScope.USER_MEMORY },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    return {
      enabled: preference?.enabled ?? false,
      chunkCount,
      lastUpdatedAt:
        (latestChunk?.updatedAt ?? preference?.updatedAt ?? null)?.toISOString() ?? null,
      retentionDays: AI_MEMORY_RETENTION_DAYS,
    };
  }

  async setEnabled(userId: string, enabled: boolean) {
    await this.prisma.aiMemoryPreference.upsert({
      where: { userId },
      create: { userId, enabled },
      update: { enabled },
    });
    return this.getStatus(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiRagChunk.deleteMany({
        where: { userId, scope: AiRagScope.USER_MEMORY },
      }),
      this.prisma.aiMemoryPreference.upsert({
        where: { userId },
        create: { userId, enabled: false },
        update: { enabled: false },
      }),
    ]);
  }

  async retrieveContext(
    userId: string,
    mood: MoodIntent,
    userMessage: string,
  ): Promise<RetrievedAiContext> {
    const now = new Date();
    const preference = await this.prisma.aiMemoryPreference.findUnique({ where: { userId } });
    const includeUserMemory = preference?.enabled === true;

    const [queryEmbedding, moodChunks, userChunks] = await Promise.all([
      this.embedding.generate(userMessage),
      this.prisma.aiRagChunk.findMany({
        where: {
          scope: AiRagScope.MOOD_TEMPLATE,
          mood,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: CANDIDATE_LIMIT,
      }),
      includeUserMemory
        ? this.prisma.aiRagChunk.findMany({
            where: {
              userId,
              scope: AiRagScope.USER_MEMORY,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: { updatedAt: 'desc' },
            take: CANDIDATE_LIMIT,
          })
        : Promise.resolve([] as AiRagChunk[]),
    ]);

    return {
      mood: this.rankChunks(moodChunks, userMessage, queryEmbedding)
        .slice(0, TOP_MOOD_CHUNKS)
        .map((chunk) => chunk.content),
      user: this.rankChunks(userChunks, userMessage, queryEmbedding)
        .slice(0, TOP_USER_CHUNKS)
        .map((chunk) => chunk.content),
    };
  }

  async observeTurn(args: ObserveAiTurnArgs): Promise<void> {
    const userMessage = args.userMessage.trim();
    const assistantReply = args.assistantReply.trim();
    if (!userMessage || !assistantReply || userMessage.startsWith('[')) return;

    const preference = await this.prisma.aiMemoryPreference.findUnique({
      where: { userId: args.userId },
    });
    if (preference?.enabled !== true) return;

    const turns = await this.bufferTurn(args);
    const signals = this.extractSignals(args, turns);
    if (signals.length === 0) return;

    const expiresAt = new Date(Date.now() + USER_MEMORY_TTL_MS);
    for (const signal of signals.slice(0, 4)) {
      const sourceKey = `mem:${args.userId}:${this.hash(signal.content)}`;
      const embedding = await this.embedding.generate(signal.content);

      await this.prisma.aiRagChunk.upsert({
        where: { sourceKey },
        create: {
          scope: AiRagScope.USER_MEMORY,
          userId: args.userId,
          mood: signal.mood,
          kind: AiRagKind.USER_SIGNAL,
          content: signal.content,
          embedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.DbNull,
          metadata: {
            reason: signal.reason,
            observedAt: new Date().toISOString(),
          } satisfies Prisma.InputJsonValue,
          sourceConversationId: args.conversationId,
          sourceKey,
          expiresAt,
        },
        update: {
          mood: signal.mood,
          embedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.DbNull,
          metadata: {
            reason: signal.reason,
            observedAt: new Date().toISOString(),
          } satisfies Prisma.InputJsonValue,
          sourceConversationId: args.conversationId,
          expiresAt,
        },
      });
    }
  }

  async seedMoodTemplates(): Promise<void> {
    const entries = Object.entries(this.tonePacks.moods) as [MoodIntent, TonePack][];
    let upserted = 0;

    for (const [mood, pack] of entries) {
      for (const example of pack.examples) {
        const sourceKey = `tone:${this.tonePacks.version}:${mood}:${example.id}`;
        const content = this.formatToneExample(mood, pack, example);
        const existing = await this.prisma.aiRagChunk.findUnique({ where: { sourceKey } });
        const embedding =
          existing?.content === content && this.toVector(existing.embedding)
            ? existing.embedding
            : await this.embedding.generate(content);

        await this.prisma.aiRagChunk.upsert({
          where: { sourceKey },
          create: {
            scope: AiRagScope.MOOD_TEMPLATE,
            mood,
            kind: AiRagKind.TONE_EXAMPLE,
            content,
            embedding: Array.isArray(embedding)
              ? (embedding as Prisma.InputJsonValue)
              : Prisma.DbNull,
            metadata: {
              tags: example.tags,
              source: 'tone-packs.json',
              version: this.tonePacks.version,
            } satisfies Prisma.InputJsonValue,
            sourceKey,
          },
          update: {
            content,
            embedding: Array.isArray(embedding)
              ? (embedding as Prisma.InputJsonValue)
              : Prisma.DbNull,
            metadata: {
              tags: example.tags,
              source: 'tone-packs.json',
              version: this.tonePacks.version,
            } satisfies Prisma.InputJsonValue,
          },
        });
        upserted += 1;
      }
    }

    if (upserted > 0) this.logger.log(`Seeded ${upserted} AI mood RAG chunks`);
  }

  private loadTonePacks(): TonePackFile {
    try {
      const raw = readFileSync(join(__dirname, '..', 'ai-peer', 'tone-packs.json'), 'utf8');
      return JSON.parse(raw) as TonePackFile;
    } catch (err) {
      this.logger.warn(`Tone pack source unavailable: ${(err as Error).message}`);
      return { version: 0, moods: {} };
    }
  }

  private async bufferTurn(args: ObserveAiTurnArgs): Promise<RecentTurn[]> {
    const key = `aimem:turns:${args.userId}:${args.conversationId}`;
    const turn: RecentTurn = {
      user: this.truncate(args.userMessage, 300),
      assistant: this.truncate(args.assistantReply, 300),
      mood: args.mood,
      at: new Date().toISOString(),
    };
    const pipeline = this.redis.pipeline();
    pipeline.lpush(key, JSON.stringify(turn));
    pipeline.ltrim(key, 0, RECENT_TURN_CAP - 1);
    pipeline.expire(key, RECENT_TURN_TTL_SEC);
    await pipeline.exec();

    const raw = await this.redis.lrange(key, 0, RECENT_TURN_CAP - 1);
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as RecentTurn;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is RecentTurn => entry !== null)
      .reverse();
  }

  private extractSignals(args: ObserveAiTurnArgs, turns: RecentTurn[]): MemorySignal[] {
    const userText = turns
      .map((turn) => turn.user)
      .join(' ')
      .toLowerCase();
    if (this.hasCrisisOrAbuse(userText)) return [];

    const signals = new Map<string, MemorySignal>();
    const add = (signal: MemorySignal) => signals.set(signal.content, signal);
    const avgLength =
      turns.reduce((sum, turn) => sum + turn.user.trim().length, 0) / Math.max(turns.length, 1);

    if (this.hasHinglish(userText)) {
      add({
        content:
          'Language preference: user often writes in Hinglish or Roman Hindi; mirror casual Hinglish naturally.',
        mood: null,
        reason: 'language',
      });
    } else if (this.hasEnglish(userText)) {
      add({
        content:
          'Language preference: user usually writes simple English; use casual English with light Hinglish only when natural.',
        mood: null,
        reason: 'language',
      });
    }

    if (
      avgLength < 80 ||
      /\b(short|small|one line|chota|chhota|zyada long mat|long mat)\b/i.test(userText)
    ) {
      add({
        content:
          'Reply style: user prefers short WhatsApp-length replies; avoid long paragraphs and keep one small question max.',
        mood: null,
        reason: 'reply_length',
      });
    }

    if (/\b(no advice|advice mat|lecture mat|solution mat|bas sun|just listen)\b/i.test(userText)) {
      add({
        content:
          'Boundary: user prefers listening and validation over advice unless they directly ask for help.',
        mood: null,
        reason: 'advice_boundary',
      });
    }

    for (const signal of this.topicSignals(userText)) add(signal);

    if (args.mood === 'FLIRTY' || args.mood === 'LATE_NIGHT') {
      if (this.hasExplicitPrompt(userText)) {
        add({
          content:
            'Mature-chat boundary: when user asks for dirty or sexual chat, keep it teasing, suggestive, non-graphic, and slow the pace playfully.',
          mood: args.mood,
          reason: 'mature_boundary',
        });
      } else if (
        /\b(flirt|flirty|cute|tease|naughty|spicy|romantic|close|miss|hug)\b/i.test(userText)
      ) {
        add({
          content:
            'Flirty comfort: user engages with playful romantic teasing; use light non-graphic innuendo and let them chase.',
          mood: args.mood,
          reason: 'flirty_comfort',
        });
      }
    }

    return [...signals.values()];
  }

  private topicSignals(text: string): MemorySignal[] {
    const topics: Array<[RegExp, string, string]> = [
      [
        /\b(breakup|ex|miss|yaad|left|relationship)\b/i,
        'relationship_history',
        'Recurring topic: user talks about relationships or missing someone; respond gently and avoid rushing them.',
      ],
      [
        /\b(work|job|boss|office|career|startup)\b/i,
        'work_stress',
        'Recurring topic: user brings up work or career stress; keep advice practical only if asked.',
      ],
      [
        /\b(study|exam|college|assignment|semester)\b/i,
        'study_stress',
        'Recurring topic: user brings up study or exam pressure; keep encouragement low-pressure and concrete.',
      ],
      [
        /\b(family|parents|mom|dad|ghar)\b/i,
        'family',
        'Recurring topic: user talks about family pressure; validate first before suggesting anything.',
      ],
      [
        /\b(neend|sleep|raat|late night|insomnia|awake)\b/i,
        'sleep_late_night',
        'Recurring topic: user is often awake late; use softer slower late-night energy.',
      ],
      [
        /\b(music|song|movie|series|anime|game|gaming)\b/i,
        'interests',
        'Recurring interest: user connects through entertainment or hobbies; use those as easy conversation hooks.',
      ],
    ];

    return topics
      .filter(([pattern]) => pattern.test(text))
      .map(([, reason, content]) => ({ content, mood: null, reason }));
  }

  private rankChunks(
    chunks: AiRagChunk[],
    query: string,
    queryEmbedding: number[] | null,
  ): AiRagChunk[] {
    return chunks
      .map((chunk) => {
        const chunkEmbedding = this.toVector(chunk.embedding);
        const score =
          queryEmbedding && chunkEmbedding
            ? this.embedding.cosineSimilarity(queryEmbedding, chunkEmbedding)
            : this.embedding.textSimilarity(query, chunk.content);
        return { chunk, score };
      })
      .sort(
        (a, b) => b.score - a.score || b.chunk.updatedAt.getTime() - a.chunk.updatedAt.getTime(),
      )
      .map(({ chunk }) => chunk);
  }

  private formatToneExample(mood: MoodIntent, pack: TonePack, example: ToneExample): string {
    return [
      `Mood: ${mood}`,
      `Intent: ${pack.intent}`,
      `User intent: ${example.userIntent}`,
      `Style rules: ${pack.rules.join(' ')}`,
      `Boundaries: ${pack.boundaries.join(' ')}`,
      `Sample replies: ${example.sampleReplies.join(' / ')}`,
    ].join('\n');
  }

  private toVector(value: Prisma.JsonValue | null): number[] | null {
    if (!Array.isArray(value)) return null;
    return value.every((item) => typeof item === 'number') ? value : null;
  }

  private hasHinglish(text: string): boolean {
    return /\b(haan|acha|arre|yaar|matlab|kya|scene|thoda|nahi|neend|raat|dil|bhai|yaad|ghar|samj)\b/i.test(
      text,
    );
  }

  private hasEnglish(text: string): boolean {
    return /[a-z]/i.test(text);
  }

  private hasExplicitPrompt(text: string): boolean {
    return /\b(dirty|sexual|sext|sexting|sex|nude|nudes|horny|boobs|dick|pussy|cock|lund|chut)\b/i.test(
      text,
    );
  }

  private hasCrisisOrAbuse(text: string): boolean {
    return /\b(suicide|self harm|kill myself|kys|k!ll yourself)\b/i.test(text);
  }

  private truncate(input: string, max: number): string {
    const normalized = input.replace(/\s+/g, ' ').trim();
    return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
  }

  private hash(input: string): string {
    return createHash('sha1').update(input).digest('hex').slice(0, 24);
  }
}
