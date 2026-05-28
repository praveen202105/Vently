/**
 * Client-side profanity pre-check.
 * Mirrors the server's two-tier list so the UI can warn the user BEFORE
 * the message is sent — giving them a chance to self-correct rather than
 * getting a hard rejection from the server.
 *
 * NOTE: This is intentionally a soft warning, not a hard block. The server
 * is the authoritative enforcement layer. This list MUST stay in sync with
 * apps/api/src/moderation/profanity.filter.ts
 */

const SEVERE_WORDS = ['k!ll yourself', 'kys'];
const MILD_WORDS = ['fuck', 'shit', 'bitch', 'asshole'];

function makePattern(words: string[]): RegExp | null {
  if (words.length === 0) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

const SEVERE_PATTERN = makePattern(SEVERE_WORDS);
const MILD_PATTERN = makePattern(MILD_WORDS);

export type ClientProfanityLevel = 'clean' | 'mild' | 'severe';

export function checkProfanityClient(text: string): ClientProfanityLevel {
  if (!text.trim()) return 'clean';
  if (SEVERE_PATTERN?.test(text)) return 'severe';
  if (MILD_PATTERN?.test(text)) return 'mild';
  return 'clean';
}
