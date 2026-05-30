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
const TOP_PERSONA_CHUNKS = 3;
const TOP_USER_CHUNKS = 4;
const CANDIDATE_LIMIT = 80;

type MemorySource = 'AI_CHAT' | 'HUMAN_CHAT';
type ModerationSeverity = 'CLEAN' | 'MILD' | 'SEVERE';

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

interface PersonaStory {
  id: string;
  nickname: string;
  gender: 'MALE' | 'FEMALE';
  ageBucket: string;
  topics: string[];
  responseRules: string[];
  sampleReplies: string[];
}

interface PersonaStoryFile {
  version: number;
  personas: PersonaStory[];
}

interface RecentTurn {
  user: string;
  assistant?: string;
  mood: MoodIntent | null;
  source: MemorySource;
  at: string;
}

interface MemorySignal {
  content: string;
  mood: MoodIntent | null;
  reason: string;
}

export interface RetrievedAiContext {
  mood: string[];
  persona: string[];
  user: string[];
}

export interface ObserveAiTurnArgs {
  userId: string;
  conversationId: string;
  mood: MoodIntent;
  userMessage: string;
  assistantReply: string;
}

export interface ObserveUserMessageArgs {
  userId: string;
  conversationId: string;
  mood: MoodIntent | null;
  body: string;
  moderationSeverity?: ModerationSeverity;
}

@Injectable()
export class AiMemoryService implements OnModuleInit {
  private readonly logger = new Logger(AiMemoryService.name);
  private readonly tonePacks: TonePackFile;
  private readonly personaStories: PersonaStoryFile;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.tonePacks = this.loadTonePacks();
    this.personaStories = this.loadPersonaStories();
  }

  onModuleInit() {
    void Promise.all([this.seedMoodTemplates(), this.seedPersonaTemplates()]).catch((err) => {
      this.logger.warn(`AI private context seed failed: ${(err as Error).message}`);
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
      enabled: preference?.enabled ?? true,
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
    personaId?: string,
  ): Promise<RetrievedAiContext> {
    const now = new Date();
    const preference = await this.prisma.aiMemoryPreference.findUnique({ where: { userId } });
    const includeUserMemory = preference?.enabled ?? true;

    const [queryEmbedding, moodChunks, personaChunks, userChunks] = await Promise.all([
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
      personaId
        ? this.prisma.aiRagChunk.findMany({
            where: {
              scope: AiRagScope.PERSONA_TEMPLATE,
              sourceKey: { startsWith: `persona:${this.personaStories.version}:${personaId}:` },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: { updatedAt: 'desc' },
            take: CANDIDATE_LIMIT,
          })
        : Promise.resolve([] as AiRagChunk[]),
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
      persona: this.rankChunks(personaChunks, userMessage, queryEmbedding)
        .slice(0, TOP_PERSONA_CHUNKS)
        .map((chunk) => chunk.content),
      user: this.rankChunks(userChunks, userMessage, queryEmbedding)
        .slice(0, TOP_USER_CHUNKS)
        .map((chunk) => chunk.content),
    };
  }

  observeTurn(args: ObserveAiTurnArgs): Promise<void> {
    const userMessage = args.userMessage.trim();
    const assistantReply = args.assistantReply.trim();
    if (!userMessage || !assistantReply || userMessage.startsWith('[')) return Promise.resolve();

    return this.observeMemory({
      userId: args.userId,
      conversationId: args.conversationId,
      mood: args.mood,
      userMessage,
      assistantReply,
      source: 'AI_CHAT',
    });
  }

  observeUserMessage(args: ObserveUserMessageArgs): Promise<void> {
    const userMessage = args.body.trim();
    if (!userMessage || userMessage.startsWith('audio:')) return Promise.resolve();
    if (args.moderationSeverity && args.moderationSeverity !== 'CLEAN') return Promise.resolve();

    return this.observeMemory({
      userId: args.userId,
      conversationId: args.conversationId,
      mood: args.mood,
      userMessage,
      source: 'HUMAN_CHAT',
    });
  }

  async seedMoodTemplates(): Promise<void> {
    const entries = Object.entries(this.tonePacks.moods) as [MoodIntent, TonePack][];
    let upserted = 0;

    for (const [mood, pack] of entries) {
      for (const example of pack.examples) {
        const sourceKey = `tone:${this.tonePacks.version}:${mood}:${example.id}`;
        const content = this.formatToneExample(mood, pack, example);
        const embedding = await this.embedding.generate(content);

        await this.upsertTemplateChunk({
          sourceKey,
          scope: AiRagScope.MOOD_TEMPLATE,
          mood,
          kind: AiRagKind.TONE_EXAMPLE,
          content,
          embedding,
          metadata: {
            tags: example.tags,
            source: 'tone-packs.json',
            version: this.tonePacks.version,
          },
        });
        upserted += 1;
      }
    }

    if (upserted > 0) this.logger.log(`Seeded ${upserted} mood context chunks`);
  }

  async seedPersonaTemplates(): Promise<void> {
    let upserted = 0;

    for (const story of this.personaStories.personas) {
      const sourceKey = `persona:${this.personaStories.version}:${story.id}:profile`;
      const content = this.formatPersonaStory(story);
      const embedding = await this.embedding.generate(content);

      await this.upsertTemplateChunk({
        sourceKey,
        scope: AiRagScope.PERSONA_TEMPLATE,
        mood: null,
        kind: AiRagKind.PERSONA_STORY,
        content,
        embedding,
        metadata: {
          personaId: story.id,
          nickname: story.nickname,
          gender: story.gender,
          source: 'persona-stories.json',
          version: this.personaStories.version,
        },
      });
      upserted += 1;
    }

    if (upserted > 0) this.logger.log(`Seeded ${upserted} persona context chunks`);
  }

  private async observeMemory(args: {
    userId: string;
    conversationId: string;
    mood: MoodIntent | null;
    userMessage: string;
    assistantReply?: string;
    source: MemorySource;
  }): Promise<void> {
    if (this.hasUnsafeMemoryText(args.userMessage)) return;

    const preference = await this.prisma.aiMemoryPreference.findUnique({
      where: { userId: args.userId },
    });
    if (preference?.enabled === false) return;

    const turns = await this.bufferTurn(args);
    const signals = this.extractSignals(args.mood, turns);
    if (signals.length === 0) return;

    const expiresAt = new Date(Date.now() + USER_MEMORY_TTL_MS);
    for (const signal of signals.slice(0, 4)) {
      const sourceKey = `mem:${args.userId}:${this.hash(signal.content)}`;
      const embedding = await this.embedding.generate(signal.content);
      const metadata = {
        reason: signal.reason,
        source: args.source,
        observedAt: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue;

      await this.prisma.aiRagChunk.upsert({
        where: { sourceKey },
        create: {
          scope: AiRagScope.USER_MEMORY,
          userId: args.userId,
          mood: signal.mood,
          kind: AiRagKind.USER_SIGNAL,
          content: signal.content,
          embedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.DbNull,
          metadata,
          sourceConversationId: args.conversationId,
          sourceKey,
          expiresAt,
        },
        update: {
          mood: signal.mood,
          embedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.DbNull,
          metadata,
          sourceConversationId: args.conversationId,
          expiresAt,
        },
      });
    }
  }

  private async upsertTemplateChunk(args: {
    sourceKey: string;
    scope: AiRagScope;
    mood: MoodIntent | null;
    kind: AiRagKind;
    content: string;
    embedding: Prisma.JsonValue | number[] | null;
    metadata: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.aiRagChunk.upsert({
      where: { sourceKey: args.sourceKey },
      create: {
        scope: args.scope,
        mood: args.mood,
        kind: args.kind,
        content: args.content,
        embedding: Array.isArray(args.embedding)
          ? (args.embedding as Prisma.InputJsonValue)
          : Prisma.DbNull,
        metadata: args.metadata,
        sourceKey: args.sourceKey,
      },
      update: {
        content: args.content,
        embedding: Array.isArray(args.embedding)
          ? (args.embedding as Prisma.InputJsonValue)
          : Prisma.DbNull,
        metadata: args.metadata,
      },
    });
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

  private loadPersonaStories(): PersonaStoryFile {
    try {
      const raw = readFileSync(join(__dirname, '..', 'ai-peer', 'persona-stories.json'), 'utf8');
      return JSON.parse(raw) as PersonaStoryFile;
    } catch (err) {
      this.logger.warn(`Persona story source unavailable: ${(err as Error).message}`);
      return { version: 0, personas: [] };
    }
  }

  private async bufferTurn(args: {
    userId: string;
    conversationId: string;
    mood: MoodIntent | null;
    userMessage: string;
    assistantReply?: string;
    source: MemorySource;
  }): Promise<RecentTurn[]> {
    const key = `aimem:turns:${args.source}:${args.userId}:${args.conversationId}`;
    const turn: RecentTurn = {
      user: this.truncate(args.userMessage, 300),
      assistant: args.assistantReply ? this.truncate(args.assistantReply, 300) : undefined,
      mood: args.mood,
      source: args.source,
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

  private extractSignals(mood: MoodIntent | null, turns: RecentTurn[]): MemorySignal[] {
    const userText = turns
      .map((turn) => turn.user)
      .join(' ')
      .toLowerCase();
    if (this.hasUnsafeMemoryText(userText)) return [];

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

    if (/\b(long reply|detail|explain|samjha|proper bata|detail mein)\b/i.test(userText)) {
      add({
        content:
          'Reply style: user sometimes asks for more detail; allow a slightly longer reply only when they request explanation.',
        mood: null,
        reason: 'detail_preference',
      });
    }

    for (const signal of this.topicSignals(userText)) add(signal);
    for (const signal of this.emotionalSignals(userText)) add(signal);

    if (
      (mood === 'FLIRTY' ||
        mood === 'LATE_NIGHT' ||
        /\b(flirt|flirty|cute|tease|naughty|spicy|romantic|close|miss|hug)\b/i.test(userText)) &&
      !this.hasExplicitPrompt(userText)
    ) {
      add({
        content:
          'Flirty comfort: user engages with playful romantic teasing; use light non-graphic innuendo and let them chase.',
        mood,
        reason: 'flirty_comfort',
      });
    }

    return [...signals.values()];
  }

  private topicSignals(text: string): MemorySignal[] {
    const topics: Array<[RegExp, string, string]> = [
      [
        /\b(breakup|ex|miss|yaad|left|relationship|crush|situationship)\b/i,
        'relationship_history',
        'Recurring topic: user talks about relationships, crushes, or missing someone; respond gently and avoid rushing them.',
      ],
      [
        /\b(work|job|boss|office|career|startup|jobless|unemployed)\b/i,
        'work_stress',
        'Recurring topic: user brings up work, career, or job uncertainty; keep advice practical only if asked.',
      ],
      [
        /\b(study|exam|college|assignment|semester|class)\b/i,
        'study_stress',
        'Recurring topic: user brings up study, college, or exam pressure; keep encouragement low-pressure and concrete.',
      ],
      [
        /\b(family|parents|mom|dad|ghar|friend|friends|dost)\b/i,
        'family_friends',
        'Recurring topic: user talks about family or friends; validate first before suggesting anything.',
      ],
      [
        /\b(neend|sleep|raat|late night|insomnia|awake)\b/i,
        'sleep_late_night',
        'Recurring topic: user is often awake late; use softer slower late-night energy.',
      ],
      [
        /\b(music|song|movie|series|anime|game|gaming|cricket|football)\b/i,
        'interests',
        'Recurring interest: user connects through entertainment, sports, or hobbies; use those as easy conversation hooks.',
      ],
    ];

    return topics
      .filter(([pattern]) => pattern.test(text))
      .map(([, reason, content]) => ({ content, mood: null, reason }));
  }

  private emotionalSignals(text: string): MemorySignal[] {
    const signals: Array<[RegExp, string, string]> = [
      [
        /\b(sad|low|empty|alone|lonely|akel|heavy|cry|rona)\b/i,
        'sadness',
        'Emotional pattern: when user sounds sad or lonely, use quiet validation before asking anything.',
      ],
      [
        /\b(angry|gussa|frustrated|annoyed|irritated)\b/i,
        'anger',
        'Emotional pattern: when user sounds angry, do not calm them down too fast; acknowledge the irritation first.',
      ],
      [
        /\b(confused|overthink|anxious|stress|pressure|panic)\b/i,
        'overthinking',
        'Emotional pattern: user may overthink under pressure; keep replies grounding and not too many questions.',
      ],
      [
        /\b(bored|timepass|fun|masti|roast|joke)\b/i,
        'playful',
        'Emotional pattern: user enjoys playful banter when the mood is light; use casual teasing without getting mean.',
      ],
    ];

    return signals
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
          queryEmbedding && chunkEmbedding && queryEmbedding.length === chunkEmbedding.length
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

  private formatPersonaStory(story: PersonaStory): string {
    return [
      `Persona: ${story.nickname} (${story.id}), ${story.ageBucket}, ${story.gender.toLowerCase()}`,
      `Life and emotional context: ${story.topics.join(' ')}`,
      `Response rules: ${story.responseRules.join(' ')}`,
      `Sample replies: ${story.sampleReplies.join(' / ')}`,
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

  private hasUnsafeMemoryText(text: string): boolean {
    return (
      this.hasExplicitPrompt(text) ||
      /\b(suicide|self harm|kill myself|kys|k!ll yourself)\b/i.test(text) ||
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
      /(?:\+?\d[\s-]?){10,}/.test(text)
    );
  }

  private truncate(input: string, max: number): string {
    const normalized = input.replace(/\s+/g, ' ').trim();
    return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
  }

  private hash(input: string): string {
    return createHash('sha1').update(input).digest('hex').slice(0, 24);
  }
}
