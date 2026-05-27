# Problem Statement — AI Ice-breaker

## The Problem

When two strangers match on Vently, they land on a blank chat screen with nothing shared
between them except a mood label (e.g. "Lonely") and an optional bio. This **cold-start
problem** creates three failure modes:

1. **Awkward silence** — neither user knows what to say first; both wait for the other.
2. **Generic openers** — "hey" / "hi" / "how are you" dominate early messages, reducing
   the emotional quality that Vently's matching promises.
3. **Early abandonment** — users leave the conversation within 30 seconds if no message
   is exchanged; the match is wasted and both users re-enter the queue frustrated.

## Who It Affects

Every matched pair, every session. The cold start is universal — it doesn't matter how
good the matchmaking algorithm is if users can't get past the first message.

## Why We Haven't Solved It Yet

- Static placeholder text ("Say hello!") was tried and ignored.
- We cannot show profile photos (anonymous by design).
- We cannot show past conversation history between these two users (first match).
- Human-written pre-set prompts are generic and feel impersonal fast.

## Proposed Solution

After a match is created, call the **Claude claude-sonnet-4-6 API** with both users' moods and bios
(stripped of any PII). Stream the response token-by-token into the chat as a **system
message with a typing cursor animation**, so the first thing both users see is a
contextually relevant, one-of-a-kind opener arriving live in their chat.

Example output for two "Lonely" users:
> *Both of you chose Lonely at 1am. Maybe start with: "What's been the hardest part of
> your week?"*

## Success Criteria

| Metric | Target |
|---|---|
| Ice-breaker appears after match | ≤ 3 seconds p95 |
| Streaming visible to both users | Yes (token-by-token) |
| Message persisted in DB | Yes (`Message.type = SYSTEM`) |
| Zero match failures caused by this feature | 0 broken matches |
| Graceful degradation on Claude API timeout | Skip silently, match still works |
| First-message rate (users who send ≥1 message after seeing ice-breaker) | Qualitatively higher than baseline; can A/B test later |

## Out of Scope (v1)

- A/B testing framework (add later once baseline is measurable)
- User ability to dismiss or regenerate the ice-breaker
- Cost optimization (caching similar mood-pair prompts)
- Multi-language support
- Ice-breakers for friend reconnects (only new matches for now)
