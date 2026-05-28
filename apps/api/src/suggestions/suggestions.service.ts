import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import type { Server } from 'socket.io';
import type { MoodIntent } from '@prisma/client';
import { SocketEvents } from '@vently/shared';

function moodInstruction(mood: MoodIntent | null): string {
  switch (mood) {
    case 'LONELY':
      return 'warm, empathetic — create a sense of connection';
    case 'NEED_TO_TALK':
      return 'open, supportive — invite them to share more';
    case 'FRIENDSHIP':
      return 'casual, fun — like chatting with a good friend';
    case 'LATE_NIGHT':
      return 'relaxed, thoughtful — cozy late-night vibes';
    case 'ADVICE':
      return 'engaged, thoughtful — show you are listening and care';
    case 'FLIRTY':
      return 'playful, light-hearted and flirty';
    default:
      return 'warm and natural';
  }
}

export interface SuggestionsParams {
  conversationId: string;
  lastMessage: string;
  mood: MoodIntent | null;
  forUserId: string | null;
  socketServer: Server;
  /**
   * Up to the last 3 message pairs (most recent last) for context-aware chips.
   * Each item is { senderId, body }. Optional — falls back to lastMessage-only mode.
   */
  recentMessages?: { senderId: string; body: string; isFromSender: boolean }[];
}

@Injectable()
export class SuggestionsService implements OnModuleInit {
  private readonly logger = new Logger(SuggestionsService.name);
  private client: Groq | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (key) this.client = new Groq({ apiKey: key });
  }

  // Always fire-and-forget — callers must NOT await this.
  async generate(params: SuggestionsParams): Promise<void> {
    if (!this.client) return;

    const { conversationId, lastMessage, mood, forUserId, socketServer, recentMessages } = params;

    // Build context-aware user content.
    // If we have recent messages, weave them into a conversation thread so
    // the model understands what has been said before (not just the last line).
    let userContent: string;
    if (recentMessages && recentMessages.length > 0) {
      const thread = recentMessages.map(
        (m) => `${m.isFromSender ? 'Them' : 'You'}: "${m.body.slice(0, 150)}"`,
      );
      thread.push(`Them: "${lastMessage.slice(0, 300)}"`); // always end with the peer's latest
      userContent = `Conversation so far:\n${thread.join('\n')}\n\nGenerate 3 short replies for "You".`;
    } else {
      userContent = `Last message: "${lastMessage.slice(0, 300)}"\nGenerate 3 replies.`;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 80,
        temperature: 0.9,
        messages: [
          {
            role: 'system',
            content:
              'You are a reply suggestion engine for a mood-based anonymous chat app. ' +
              'Output ONLY a valid JSON array of exactly 3 short reply strings. ' +
              `Each reply must be under 10 words. Tone: ${moodInstruction(mood)}. ` +
              'No explanation. No markdown. Just the raw JSON array.',
          },
          { role: 'user', content: userContent },
        ],
        stream: false,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '';
      const suggestions = this.parse(raw);
      if (suggestions.length === 0) return;

      socketServer.to(`conv:${conversationId}`).emit(SocketEvents.CHAT_SUGGESTIONS, {
        conversationId,
        suggestions,
        forUserId,
      });
    } catch (err) {
      this.logger.warn(`Suggestions failed for conv ${conversationId}: ${(err as Error).message}`);
    }
  }

  private parse(raw: string): string[] {
    try {
      // Extract the JSON array even if the model wraps it in prose.
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const arr = JSON.parse(match[0]);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 3);
    } catch {
      return [];
    }
  }
}
