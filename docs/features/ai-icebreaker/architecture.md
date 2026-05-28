# Architecture — AI Ice-breaker

## Overview

After matchmaking creates a Conversation, a new **IcebreakerService** calls the
**Groq API** (free tier — Llama 3.1 8B Instant) with a structured prompt. The response
is streamed token-by-token into the existing Socket.io conversation room via new events.
Once the stream is complete, the full text is persisted as a `Message(type=SYSTEM)` row
so reconnecting users can see it.

**Why Groq (free)?** Groq's free tier gives 6000 requests/day + 30 req/min with
`llama-3.1-8b-instant` — more than enough at this scale. It is also the fastest
inference service available (~500 tokens/s vs ~60 for Claude Sonnet), so streaming
feels snappier. No credit card required.

---

## System Flow

```
MatchmakingService.createMatch()
        │
        ▼
IcebreakerService.generate(conversationId, userA, userB)   ← fire-and-forget
        │
        ├─ Build prompt (mood + bio, no PII)
        │
        ├─ Groq API streaming call — llama-3.1-8b-instant (max_tokens=120)
        │         │
        │         │  stream.on('text')  (token chunks)
        │         ▼
        ├─ Emit  chat:icebreaker:chunk  { conversationId, chunk }
        │         → Socket.io room `conv:<id>` (both users receive live)
        │
        ├─ Accumulate full text in memory
        │
        ├─ On stream end: emit  chat:icebreaker:done  { conversationId }
        │
        └─ INSERT Message { senderId: null, body: fullText, type: SYSTEM }
                  └─ Emit  chat:message  (standard event) so offline/reconnected
                           users receive it via the normal history load
```

---

## Sequence Diagram

```
MatchmakingGateway   IcebreakerService   Claude API   Socket room   ChatGateway
        │                    │                │              │              │
match:found ─────────────────►               │              │              │
        │            generate()              │              │              │
        │                    │──── POST streaming ──────────►             │
        │                    │◄─── token "Both" ────────────│             │
        │                    │────────── icebreaker:chunk ──────────────► │
        │                    │◄─── token " of" ─────────────│             │
        │                    │────────── icebreaker:chunk ──────────────► │
        │                    │  ... (N tokens) ...           │             │
        │                    │◄─── stream end ───────────────│             │
        │                    │────────── icebreaker:done ───────────────► │
        │                    │── INSERT Message(SYSTEM) ─────────────────►│
        │                    │────────── chat:message ───────────────────►│
```

---

## New Module: `apps/api/src/icebreaker/`

```
icebreaker/
  icebreaker.module.ts       NestJS module; exports IcebreakerService
  icebreaker.service.ts      Core logic: prompt build + Claude stream + emit + persist
  icebreaker.prompt.ts       Prompt template (separate file for easy tuning)
```

The module is imported in `app.module.ts`. `IcebreakerService` is injected into
`MatchmakingService`.

---

## New Socket Events

Added to `packages/shared/src/socket-events.ts`:

| Event                   | Direction | Payload                                     |
| ----------------------- | --------- | ------------------------------------------- |
| `chat:icebreaker:chunk` | s→c       | `{ conversationId: string, chunk: string }` |
| `chat:icebreaker:done`  | s→c       | `{ conversationId: string }`                |

`chat:message` (existing) is still emitted once at the end with the persisted full text,
so users who connect after the stream is done see the ice-breaker via the normal history
load (`GET /conversations/:id/messages`). No new REST endpoint needed.

---

## Prompt Design

```
System:
  You are an empathetic assistant for Vently, an anonymous chat app.
  Your only job is to write a single, short ice-breaker (1–2 sentences, ≤ 80 words)
  that helps two matched strangers start a real conversation.
  Rules:
  - Never reveal one user's bio to the other.
  - Never mention names, genders, or any identifying detail.
  - Be warm, curious, and specific to their shared mood.
  - Do NOT start with "Hey" or "Hi".
  - Output the ice-breaker only — no explanation, no prefix.

User:
  User A mood: {moodA}
  User A bio: {bioA | "not provided"}
  User B mood: {moodB}
  User B bio: {bioB | "not provided"}
  Time of day: {morning|afternoon|evening|late night}
```

**Why separate `icebreaker.prompt.ts`:** the prompt is the most likely thing to be tuned
without changing logic. Keeping it isolated lets you swap templates, add few-shot
examples, or A/B test variants without touching service code.

---

## Frontend Changes

### New Zustand state (in `chatStore`)

```ts
icebreakerBuffer: string; // accumulates chunks
icebreakerDone: boolean;
```

### Socket event handlers (in `chat-screen.tsx`)

- On `chat:icebreaker:chunk` → append to `icebreakerBuffer`
- On `chat:icebreaker:done` → set `icebreakerDone = true`, clear buffer

### Rendering

A `<IcebreakerBubble>` component renders above the message list while streaming.
It shows the accumulated buffer with an animated blinking cursor (`▋`) until
`icebreakerDone` is true, then fades smoothly into the normal system message that
arrives via `chat:message`.

---

## Data Model Change

No schema change. We reuse `Message.type = SYSTEM` and leave `senderId = null`
(already nullable in the schema — `Message.senderId String?`).

---

## New Environment Variable

| Key            | Where               | Value                                        |
| -------------- | ------------------- | -------------------------------------------- |
| `GROQ_API_KEY` | Railway api service | From console.groq.com (free, no credit card) |

`IcebreakerService` silently disables itself if the key is missing — local dev works
without VAPID or Groq keys, same pattern as `PushService`.

---

## Error Boundaries

| Failure                                     | Behavior                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Claude API throws / times out               | Catch in `generate()`, log warning, no emit — match unaffected                      |
| Stream stalls > 8s                          | Abort via `AbortController` timeout, persist whatever was buffered                  |
| Socket room empty (both users disconnected) | Emit silently fails; message persists for reconnect                                 |
| Claude returns inappropriate content        | Run output through existing `ModerationService.check()` — SEVERE = discard, no emit |
| `ANTHROPIC_API_KEY` not set                 | `this.enabled = false`, `generate()` is a no-op                                     |

---

## Dependencies

```bash
# api only
pnpm --filter @vently/api add groq-sdk
```

No new web dependencies. Streaming tokens arrive over the existing socket.

---

## Security Considerations

- Bios are sent to the Anthropic API (third-party). Only send bios if the user explicitly
  set one (opt-in text). Strip any email/phone patterns from the bio before sending.
- Access tokens, userIds, and emails are never included in the prompt.
- The Claude response is run through `ModerationService` before being persisted or emitted.

---

## Performance Budget

| Operation                                        | Expected latency                           |
| ------------------------------------------------ | ------------------------------------------ |
| `generate()` called after `match:found`          | Fire-and-forget; does not block match emit |
| First token from Claude                          | ~400–800 ms (claude-sonnet-4-6, warm)      |
| Full stream (120 tokens)                         | ~0.3–0.6 s (Groq ~500 tok/s)               |
| Total time from match to first visible character | ~300–600 ms                                |

`max_tokens: 120` keeps the response short. Groq free tier: **$0/match** up to
6000 matches/day. No cost until you need >6000 matches/day, at which point you
upgrade to a paid Groq plan (~$0.06/M tokens — still 50× cheaper than Claude).
