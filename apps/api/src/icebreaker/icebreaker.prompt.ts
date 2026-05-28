import type { MoodIntent } from '@prisma/client';

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 6) return 'late night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}/g;
const PHONE_RE = /\+?[\d\s\-().]{7,15}/g;

function sanitizeBio(bio: string | null): string {
  if (!bio) return 'not provided';
  return bio.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]').slice(0, 150);
}

export function buildPrompt(
  mood: MoodIntent,
  bioA: string | null,
  bioB: string | null,
): { system: string; user: string } {
  return {
    system: `You are an empathetic assistant for Vently, an anonymous chat app.
Write a single ice-breaker (1–2 sentences, ≤ 80 words) to help two matched strangers start a real conversation.
Rules:
- Never reveal one person's bio to the other.
- Never mention names, genders, ages, or any identifying detail.
- Be warm, curious, and specific to their shared mood.
- Do NOT start with "Hey", "Hi", or "Hello".
- Output only the ice-breaker text — no preamble, no label, no explanation.`,
    user: `Shared mood: ${mood}
Person A bio: ${sanitizeBio(bioA)}
Person B bio: ${sanitizeBio(bioB)}
Time of day: ${timeOfDay()}`,
  };
}
