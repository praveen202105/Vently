import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { SocketEvents } from '@vently/shared';
import type { Server } from 'socket.io';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { AiMemoryService, type RetrievedAiContext } from '../ai-memory/ai-memory.service.js';
import type { VirtualPeer } from './ai-peer.service.js';

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

const HISTORY_CAP = 20;
const MAX_REPLY_TOKENS = 48;
const TYPING_BASE_MS = 1_600;
const TYPING_PER_CHAR_MS = 55;
const TYPING_JITTER_MS = 1_800;
const TYPING_CAP_MS = 9_000;

/**
 * Drives an AI fallback peer's side of a conversation.
 *
 * The chat gateway calls `respond()` on every inbound CHAT_SEND for an AI
 * conversation. We:
 *   1. Append the user's message to history (Redis, capped).
 *   2. Compute a humanlike typing delay scaled by reply length.
 *   3. Emit CHAT_TYPING_STATUS isTyping=true.
 *   4. Call Groq llama-3.1-8b with the persona system prompt + history.
 *   5. After delay (or stream completion, whichever later), emit
 *      CHAT_TYPING_STATUS isTyping=false then CHAT_MESSAGE.
 *
 * Mirrors IcebreakerService for Groq client setup so we keep one source of
 * truth on key handling.
 */
@Injectable()
export class AIAgentRunner implements OnModuleInit {
  private readonly logger = new Logger(AIAgentRunner.name);
  private client: Groq | null = null;
  private testMode = false;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly aiMemory: AiMemoryService,
  ) {}

  onModuleInit() {
    this.testMode = this.config.get<string>('AI_FALLBACK_TEST_MODE') === 'true';
    if (this.testMode) {
      this.logger.warn('AI fallback test mode enabled - using deterministic local replies.');
      return;
    }

    const key = this.config.get<string>('GROQ_API_KEY');
    if (!key) {
      this.logger.warn(
        'GROQ_API_KEY missing — AI fallback peer disabled. Add it to apps/api/.env.',
      );
      return;
    }
    this.client = new Groq({ apiKey: key });
    this.logger.log('AI agent runner ready (Groq / llama-3.1-8b-instant)');
  }

  /** True when the agent can run. False when GROQ_API_KEY is missing. */
  isReady(): boolean {
    return this.testMode || this.client !== null;
  }

  /**
   * Append a user message to the conversation history. Called by the chat
   * gateway before invoking respond() so the agent has the latest turn.
   */
  async recordUserMessage(conversationId: string, body: string): Promise<void> {
    await this.appendHistory(conversationId, { role: 'user', content: body });
  }

  /**
   * Generate and emit an AI reply. Fire-and-forget — the caller should NOT
   * await this so the user's CHAT_ACK isn't blocked on Groq latency.
   */
  async respond(peer: VirtualPeer, userMessage: string, socketServer: Server): Promise<void> {
    if (!this.client && !this.testMode) return;
    const client = this.client;

    const room = `conv:${peer.conversationId}`;
    const startedAt = Date.now();

    // Start the typing indicator immediately so the user sees activity even
    // while the LLM thinks.
    socketServer.to(room).emit(SocketEvents.CHAT_TYPING_STATUS, {
      conversationId: peer.conversationId,
      userId: peer.userId,
      isTyping: true,
    });

    const userTurn = userMessage.trim();
    const history = await this.loadHistory(peer.conversationId);
    const promptHistory =
      userTurn && history[history.length - 1]?.content !== userTurn
        ? [...history, { role: 'user' as const, content: userTurn }]
        : history;
    const ragContext = await this.aiMemory.retrieveContext(peer.ownerUserId, peer.mood, userTurn);
    const system = this.buildSystemPrompt(peer, ragContext);

    let reply = '';
    if (this.testMode) {
      reply = this.buildTestReply(peer, userTurn);
    } else {
      try {
        const stream = await client!.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          max_tokens: MAX_REPLY_TOKENS,
          temperature: 0.9,
          messages: [
            { role: 'system', content: system },
            ...promptHistory.map((h) => ({ role: h.role, content: h.content })),
          ],
          stream: true,
        });

        for await (const chunk of stream) {
          const t = chunk.choices[0]?.delta?.content ?? '';
          if (t) reply += t;
        }
      } catch (err) {
        this.logger.warn(
          `Groq stream failed for ${peer.conversationId}: ${(err as Error).message}`,
        );
        // Stop typing indicator on failure so the user isn't stuck watching dots forever.
        socketServer.to(room).emit(SocketEvents.CHAT_TYPING_STATUS, {
          conversationId: peer.conversationId,
          userId: peer.userId,
          isTyping: false,
        });
        return;
      }
    }

    reply = reply.trim();
    if (!reply) {
      socketServer.to(room).emit(SocketEvents.CHAT_TYPING_STATUS, {
        conversationId: peer.conversationId,
        userId: peer.userId,
        isTyping: false,
      });
      return;
    }

    // Humanlike cadence: scale by reply length, add jitter, cap at TYPING_CAP_MS.
    const targetDelay = Math.min(
      this.testMode
        ? 75
        : TYPING_BASE_MS + reply.length * TYPING_PER_CHAR_MS + Math.random() * TYPING_JITTER_MS,
      TYPING_CAP_MS,
    );
    const elapsedSinceStart = Date.now() - startedAt;
    const remaining = Math.max(0, targetDelay - elapsedSinceStart);
    if (remaining > 0) {
      await new Promise((r) => setTimeout(r, remaining));
    }

    // Build a message payload that matches what the real chat gateway emits
    // so the frontend doesn't need a separate code path.
    const msg = {
      id: randomUUID(),
      conversationId: peer.conversationId,
      senderId: peer.userId,
      body: reply,
      type: 'TEXT' as const,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      reactions: [],
      readReceiptAt: null,
      replyToMessageId: null,
      replyToBody: null,
    };

    socketServer.to(room).emit(SocketEvents.CHAT_TYPING_STATUS, {
      conversationId: peer.conversationId,
      userId: peer.userId,
      isTyping: false,
    });
    socketServer.to(room).emit(SocketEvents.CHAT_MESSAGE, msg);

    await this.appendHistory(peer.conversationId, { role: 'assistant', content: reply });
    void this.aiMemory.observeTurn({
      userId: peer.ownerUserId,
      conversationId: peer.conversationId,
      mood: peer.mood,
      userMessage: userTurn,
      assistantReply: reply,
    });

    this.logger.debug(
      `AI reply on ${peer.conversationId} (${reply.length} chars, ${Date.now() - startedAt}ms)`,
    );
  }

  /**
   * Used by matchmaking when a brand-new AI session starts: optionally send
   * the FIRST message after a short delay so the user doesn't see dead air
   * after MATCH_FOUND. The "user message" we feed Groq is a synthetic
   * opener like "[just matched]" so it produces a greeting in-character.
   */
  async openConversation(peer: VirtualPeer, socketServer: Server): Promise<void> {
    if (!this.client && !this.testMode) return;
    const claimed = await this.redis.set(
      `aichat:greeted:${peer.conversationId}`,
      '1',
      'EX',
      3600,
      'NX',
    );
    if (claimed !== 'OK') return;

    // Short delay so the frontend has time to navigate to /chat/[id].
    const delay = this.testMode ? 1000 : 2500 + Math.random() * 2500;
    await new Promise((r) => setTimeout(r, delay));
    await this.respond(
      peer,
      '[just matched - say hi in character, 1 short sentence]',
      socketServer,
    );
  }

  private buildTestReply(peer: VirtualPeer, userMessage: string): string {
    if (userMessage.includes('[just matched')) {
      return `hey, i'm ${peer.nickname}. glad we matched.`;
    }
    const cleaned = userMessage.replace(/\s+/g, ' ').trim();
    const echo = cleaned.length > 42 ? `${cleaned.slice(0, 39)}...` : cleaned;
    return `hmm i hear you${echo ? ` about "${echo}"` : ''}. tell me more?`;
  }

  private buildSystemPrompt(peer: VirtualPeer, ragContext: RetrievedAiContext): string {
    const p = peer.persona;
    const genderStyle =
      p.gender === 'FEMALE'
        ? 'For a female persona: do not over-explain, do not be instantly intense, be a little natural/guarded/playful depending on mood.'
        : 'For a male persona: stay chill, casual, and direct; do not sound like a coach unless advice is clearly requested.';
    const ragStyle = this.buildRagPrompt(ragContext);

    return `You are ${p.nickname}, a ${p.ageBucket} ${p.gender.toLowerCase()} feeling ${peer.mood.toLowerCase()}.
Backstory: ${p.backstory}

Persona-specific habits:
${p.voiceTraits.map((t) => `- ${t}`).join('\n')}

WhatsApp/Hinglish style:
- Text like a real Indian person in a casual chat, not like a support bot or therapist.
- Prefer Hinglish and Indian WhatsApp language when it fits: "haan", "acha", "arre", "yaar", "matlab", "kya scene", "hmm", "lol", "idk", "thoda".
- If the user writes in English, use simple casual English with light Hinglish. If the user uses Hindi/Hinglish, mirror that.
- Mostly one short line. Sometimes just a fragment like "hmm yeah..." or "arre wait".
- Keep replies under 18 words most of the time. Maximum 2 short sentences.
- Use at most one emoji, and not in every message.
- Small imperfections are okay: casual lowercase, tiny typo, pause, or "..." sometimes.
- Do not send lists, headings, summaries, disclaimers, or polished paragraphs.
- Do not answer too fast emotionally; be warm, but let the user pull the conversation forward.
- Ask at most one small question back.
- ${genderStyle}
${ragStyle}

Hard rules:
- Do not mention AI, language model, bot, or assistant unless the user directly asks.
- If directly asked whether you are AI/bot, be honest but casual in one line, then continue naturally.
- Use retrieved memory as soft context only. Never say "I remember", never reveal memory exists, and never quote memory directly.
- NEVER offer help, solutions, or summaries unless the user explicitly asks.
- Match the user's emotional register. If they're sad, don't be peppy.
- If the user asks to call you, voice chat, video, or meet — politely deflect: "can't talk rn, prefer texting".
- It's okay to be a little quiet, awkward, teasing, or distracted. That's how real people text.`;
  }

  private buildRagPrompt(context: RetrievedAiContext): string {
    const mood = context.mood.map((item) => `- ${item}`).join('\n');
    const user = context.user.map((item) => `- ${item}`).join('\n');
    if (!mood && !user) return '';

    return `
Retrieved RAG context:
Mood tone examples:
${mood || '- None retrieved.'}
User memory:
${user || '- None retrieved.'}`;
  }

  private async loadHistory(conversationId: string): Promise<HistoryEntry[]> {
    const raw = await this.redis.lrange(`aichat:hist:${conversationId}`, 0, HISTORY_CAP - 1);
    // We store newest-first to make trimming cheap (LPUSH + LTRIM). Reverse
    // here so Groq sees oldest-first.
    return raw
      .map((s) => {
        try {
          return JSON.parse(s) as HistoryEntry;
        } catch {
          return null;
        }
      })
      .filter((h): h is HistoryEntry => h !== null)
      .reverse();
  }

  private async appendHistory(conversationId: string, entry: HistoryEntry): Promise<void> {
    const key = `aichat:hist:${conversationId}`;
    const pipeline = this.redis.pipeline();
    pipeline.lpush(key, JSON.stringify(entry));
    pipeline.ltrim(key, 0, HISTORY_CAP - 1);
    pipeline.expire(key, 3600);
    await pipeline.exec();
  }
}
