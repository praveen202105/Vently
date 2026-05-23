/**
 * Lightweight profanity check. Two tiers:
 *   - MILD  → flag the message but allow it through (visible to peer).
 *   - SEVERE → reject the message entirely; a ModerationFlag row is written.
 *
 * Lists are intentionally short + censored here; product can expand them via
 * config/database later. The matching is case-insensitive and uses word
 * boundaries so "scunthorpe" style false positives stay out.
 */

const SEVERE_WORDS = [
  // Slurs and severely abusive terms — placeholders here; replace with the
  // org's actual moderation list in prod.
  'k!ll yourself',
  'kys',
];

const MILD_WORDS = ['fuck', 'shit', 'bitch', 'asshole'];

function makePattern(words: string[]) {
  if (words.length === 0) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

const SEVERE_PATTERN = makePattern(SEVERE_WORDS);
const MILD_PATTERN = makePattern(MILD_WORDS);

export type ProfanityResult =
  | { severity: 'CLEAN' }
  | { severity: 'MILD'; match: string }
  | { severity: 'SEVERE'; match: string };

export function checkProfanity(text: string): ProfanityResult {
  if (SEVERE_PATTERN) {
    const m = SEVERE_PATTERN.exec(text);
    if (m) return { severity: 'SEVERE', match: m[1] ?? m[0] };
  }
  if (MILD_PATTERN) {
    const m = MILD_PATTERN.exec(text);
    if (m) return { severity: 'MILD', match: m[1] ?? m[0] };
  }
  return { severity: 'CLEAN' };
}
