import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import type { Server } from 'socket.io';
import type { MoodIntent } from '@prisma/client';
import { SocketEvents } from '@vently/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { SuggestionsService } from '../suggestions/suggestions.service.js';
import { buildPrompt } from './icebreaker.prompt.js';

export interface IcebreakerParams {
  conversationId: string;
  userAId: string;
  userBId: string;
  mood: MoodIntent;
  socketServer: Server;
}

@Injectable()
export class IcebreakerService implements OnModuleInit {
  private readonly logger = new Logger(IcebreakerService.name);
  private client: Groq | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly suggestions: SuggestionsService,
  ) {}

  onModuleInit() {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (!key) {
      this.logger.warn(
        'GROQ_API_KEY missing — ice-breaker disabled. Get a free key at https://console.groq.com',
      );
      return;
    }
    this.client = new Groq({ apiKey: key });
    this.logger.log('Ice-breaker service enabled (Groq / llama-3.1-8b-instant)');
  }

  // Always fire-and-forget — callers must NOT await this.
  async generate(params: IcebreakerParams): Promise<void> {
    if (!this.client) return;

    const { conversationId, userAId, userBId, mood, socketServer } = params;

    // VOICE_ONLY matches go straight to /call — no chat screen, skip ice-breaker.
    if (mood === 'VOICE_ONLY') return;

    const room = `conv:${conversationId}`;
    const startedAt = Date.now();

    const [profileA, profileB] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId: userAId }, select: { bio: true } }),
      this.prisma.profile.findUnique({ where: { userId: userBId }, select: { bio: true } }),
    ]);

    const { system, user } = buildPrompt(mood, profileA?.bio ?? null, profileB?.bio ?? null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    let accumulated = '';

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: 'llama-3.1-8b-instant',
          max_tokens: 120,
          temperature: 0.85,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          stream: true,
        },
        { signal: controller.signal },
      );

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (!text) continue;
        accumulated += text;
        socketServer
          .to(room)
          .emit(SocketEvents.CHAT_ICEBREAKER_CHUNK, { conversationId, chunk: text });
      }

      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      this.logger.warn(
        `Ice-breaker stream failed (${Date.now() - startedAt}ms): ${(err as Error).message}`,
      );
      if (!accumulated) return;
    }

    accumulated = accumulated.trim();
    if (!accumulated) return;

    const modResult = this.moderation.inspectMessage(accumulated);
    if (modResult.severity === 'SEVERE') {
      this.logger.warn('Ice-breaker rejected by moderation filter');
      return;
    }

    socketServer.to(room).emit(SocketEvents.CHAT_ICEBREAKER_DONE, { conversationId });

    // Fire opening suggestions for both users — forUserId:null means the
    // frontend shows chips to whichever user receives the event.
    void this.suggestions.generate({
      conversationId,
      lastMessage: accumulated,
      mood,
      forUserId: null,
      socketServer,
    });

    this.logger.log({
      event: 'icebreaker.generated',
      conversationId,
      mood,
      durationMs: Date.now() - startedAt,
    });
  }
}
