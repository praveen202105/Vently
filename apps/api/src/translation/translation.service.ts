import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import type { MoodIntent } from '@prisma/client';

function moodInstruction(mood: MoodIntent | null): string {
  switch (mood) {
    case 'LONELY':       return 'warm, empathetic — create a sense of connection';
    case 'NEED_TO_TALK': return 'open, supportive — invite them to share more';
    case 'FRIENDSHIP':   return 'casual, fun — like chatting with a good friend';
    case 'LATE_NIGHT':   return 'relaxed, thoughtful — cozy late-night vibes';
    case 'ADVICE':       return 'engaged, thoughtful — show you are listening and care';
    case 'FLIRTY':       return 'playful, light-hearted and flirty';
    default:             return 'warm and natural';
  }
}

export interface TranslateResult {
  detectedLanguage: string;
  translated: string;
  /** 0–3 localized reply chip suggestions in the target language. */
  chips: string[];
}

export interface TranslateParams {
  body: string;
  /** BCP-47 tag of the viewer's browser locale, e.g. "en", "hi", "es". */
  targetLocale: string;
  mood: MoodIntent | null;
}

@Injectable()
export class TranslationService implements OnModuleInit {
  private readonly logger = new Logger(TranslationService.name);
  private client: Groq | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (key) this.client = new Groq({ apiKey: key });
  }

  async translate(params: TranslateParams): Promise<TranslateResult> {
    const { body, targetLocale, mood } = params;

    // Graceful fallback when Groq is unavailable (no key in env).
    if (!this.client) {
      return { detectedLanguage: 'unknown', translated: body, chips: [] };
    }

    const systemPrompt =
      'You are a language detection and translation engine embedded in a mood-based anonymous chat app. ' +
      'Given a message, you must:\n' +
      `1. Detect the source language of the message.\n` +
      `2. Translate the message into "${targetLocale}" (BCP-47 locale). If the message is already in that locale, keep it unchanged.\n` +
      `3. Generate exactly 3 short reply suggestions (under 10 words each) in "${targetLocale}" that match the conversation tone: ${moodInstruction(mood)}.\n` +
      'Output ONLY a valid JSON object — no markdown, no prose — with this exact shape:\n' +
      '{"detectedLanguage":"<ISO 639-1 code>","translated":"<translated text>","chips":["<reply 1>","<reply 2>","<reply 3>"]}';

    try {
      const response = await this.client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 200,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Message: "${body.slice(0, 500)}"` },
        ],
        stream: false,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '';
      return this.parse(raw, body);
    } catch (err) {
      this.logger.warn(`Translation failed: ${(err as Error).message}`);
      return { detectedLanguage: 'unknown', translated: body, chips: [] };
    }
  }

  private parse(raw: string, originalBody: string): TranslateResult {
    try {
      // Extract the JSON object even if the model adds surrounding prose.
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { detectedLanguage: 'unknown', translated: originalBody, chips: [] };
      const obj = JSON.parse(match[0]) as Partial<TranslateResult>;
      return {
        detectedLanguage:
          typeof obj.detectedLanguage === 'string' && obj.detectedLanguage.trim()
            ? obj.detectedLanguage.trim()
            : 'unknown',
        translated:
          typeof obj.translated === 'string' && obj.translated.trim()
            ? obj.translated.trim()
            : originalBody,
        chips: Array.isArray(obj.chips)
          ? (obj.chips as unknown[])
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .slice(0, 3)
          : [],
      };
    } catch {
      return { detectedLanguage: 'unknown', translated: originalBody, chips: [] };
    }
  }
}
