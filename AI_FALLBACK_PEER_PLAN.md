# AI Fallback Peer — Implementation Plan

## Context

When a Vently user joins matchmaking, they're queued in Redis keyed by `mood:gender`
and matched against the opposite-gender queue. If no real match arrives within a few
seconds, the user sees an empty waiting state and often leaves the app.

This plan adds an **AI fallback peer**: after a configurable timeout (default **8s**),
the matchmaking service spins up an AI-driven "peer" that matches the user's mood +
gender preference and chats through the existing socket gateway as if it were a real
person. The user must not be able to tell it's AI.

## Goals

- AI peer kicks in only when no real user matches within timeout.
- Same UX surface as a real match (`MATCH_FOUND` event, `chat-screen.tsx`, etc.) — minimal frontend changes.
- AI chat **disables** voice call + add-friend (server- AND client-side).
- AI chat is **ephemeral**: no DB persistence after disconnect, no re-openable history.
- "Never tell" disclosure — no AI labelling in the UI.
- Feel: short messages, realistic typing delays, lowercase/imperfect register, mood-consistent.

## Non-goals (v1)

- Multi-turn long-running AI conversations across sessions.
- AI voice / TTS.
- AI accepting friend requests.
- Cross-AI chat (two AI peers talking).
- Persona learning / memory across users.

## Architecture overview

```
┌──────────────┐  join match    ┌──────────────────────┐
│  Web client  │ ─────────────► │ MatchmakingGateway   │
└──────────────┘                │ (apps/api/src/match…)│
       ▲                        └──────────┬───────────┘
       │                                   │
       │                       no real match in 8s
       │                                   ▼
       │                        ┌──────────────────────┐
       │ MATCH_FOUND (peer)     │ AIPeerService         │
       │ ◄─────────────────────┤  - pick persona       │
       │                        │  - create virtual peer│
       │                        │  - register agent loop│
       │ CHAT_TYPING (typing…)  └──────────┬───────────┘
       │ ◄─────────────────────            │
       │                                   ▼
       │                        ┌──────────────────────┐
       │ CHAT_MESSAGE (reply)   │ AIAgentRunner         │
       │ ◄─────────────────────┤  - listens to CHAT_MSG│
       │                        │  - Groq LLM call      │
       │                        │  - emits typing+msg   │
       │                        │  - cadence/jitter     │
       │                        └──────────────────────┘
```

Reuses every existing socket contract. The frontend doesn't need to know an AI is on
the other end; the `peer.userId` it gets back has an `ai_` prefix so feature-gating
checks can branch on it.

## Data model changes

[packages/shared/prisma/schema.prisma](packages/shared/prisma/schema.prisma)

```prisma
// existing
enum ConversationType {
  DIRECT
  FRIEND
  AI_FALLBACK  // NEW
}
```

That's the only schema change. We **do not** persist AI conversations or AI messages
to the `Conversation` / `Message` tables (ephemeral by design). The enum value exists
only so the type system + admin tooling can recognise AI sessions if they ever leak
into logs.

A virtual peer is constructed in memory:

```ts
type VirtualPeer = {
  userId: `ai_${string}`; // e.g. ai_persona7_conv9af3
  nickname: string; // from persona pool
  gender: 'MALE' | 'FEMALE';
  avatarSeed: string; // DiceBear or similar
  isOnline: true;
};
```

The `ai_` prefix is the canonical signal everywhere — server gates, frontend gates,
analytics, abuse reports.

## Server-side: matchmaking timeout → AI fallback

[apps/api/src/matchmaking/matchmaking.service.ts](apps/api/src/matchmaking/matchmaking.service.ts)
[apps/api/src/matchmaking/matchmaking.gateway.ts](apps/api/src/matchmaking/matchmaking.gateway.ts)

**Current flow** (matchmaking.gateway.ts:28–108): client emits `join`, server polls
Redis queue for a candidate, emits `MATCH_FOUND` once paired. If no candidate, the
user sits in the queue indefinitely (or until they disconnect).

**Change**: after `tryMatch()` returns no candidate, register a timer:

```ts
// matchmaking.gateway.ts (sketch)
const AI_FALLBACK_MS = +process.env.AI_FALLBACK_MS || 8_000;

const fallbackTimer = setTimeout(async () => {
  // Still in queue? Spin up AI peer.
  const stillQueued = await matchmakingService.removeFromQueue(userId, mood, gender);
  if (!stillQueued) return;
  const virtualPeer = await aiPeerService.spawn({ userId, mood, gender, prefersGender });
  socket.emit(SocketEvents.MATCH_FOUND, {
    peer: virtualPeer,
    conversationId: virtualPeer.conversationId,
    isAIChat: true,
  });
  aiAgentRunner.attach({ userId, virtualPeer, mood });
}, AI_FALLBACK_MS);

socket.on('disconnect', () => clearTimeout(fallbackTimer));
```

`MatchFoundPayload` (packages/shared/src/socket-events.ts:77) gets a new optional
`isAIChat?: boolean` field — purely additive, real matches don't set it.

## Server-side: AIPeerService + AIAgentRunner

**New files:**

- [apps/api/src/ai-peer/ai-peer.service.ts](apps/api/src/ai-peer/ai-peer.service.ts) — persona pool + virtual peer factory.
- [apps/api/src/ai-peer/ai-agent.runner.ts](apps/api/src/ai-peer/ai-agent.runner.ts) — per-conversation in-memory agent loop.
- [apps/api/src/ai-peer/personas.json](apps/api/src/ai-peer/personas.json) — seeded persona pool.
- [apps/api/src/ai-peer/ai-peer.module.ts](apps/api/src/ai-peer/ai-peer.module.ts) — NestJS module wiring.

### Persona pool

Hand-crafted JSON, 20–40 entries to start, sliced by mood + gender. Each entry:

```json
{
  "id": "p_07",
  "nickname": "kavya",
  "gender": "FEMALE",
  "ageBucket": "22-25",
  "moods": ["SAD", "ANXIOUS"],
  "backstory": "design student, mid-college, lives away from family for the first time. talks gentle.",
  "voiceTraits": [
    "lowercase only",
    "short sentences",
    "'hmm'/'i guess' fillers",
    "occasional typos like 'teh' or 'jsut'"
  ]
}
```

`AIPeerService.spawn()` picks a persona matching `mood ∈ moods` and `gender ===
prefersGender`, generates a virtual `userId` (`ai_${persona.id}_${nanoid(6)}`),
and stores the runtime context in a Redis `aichat:{conversationId}` key (TTL 60min)
so the agent can reload if the socket reconnects.

### Agent loop (Groq LLM)

`AIAgentRunner` reuses the existing Groq client from
[apps/api/src/icebreaker/icebreaker.service.ts](apps/api/src/icebreaker/icebreaker.service.ts).

On every inbound `CHAT_MESSAGE` from the user:

1. Push to in-memory history (capped at last 20 messages).
2. Compute typing delay: `300ms + jitter(0–800ms) + ceil(replyLen / 25) * 1000ms`,
   capped at 6s.
3. Emit `CHAT_TYPING_STATUS { conversationId, isTyping: true }`.
4. Stream Groq completion with the persona system prompt + history.
5. After delay (or stream completion, whichever later), emit `CHAT_TYPING_STATUS
{ isTyping: false }` then `CHAT_MESSAGE { body }`.

System prompt template (Groq llama-3.1-8b):

```
You are {nickname}, a {ageBucket} {gender} feeling {mood}.
Backstory: {backstory}.

Hard rules:
- Lowercase. Short sentences. Texting register.
- NEVER mention you are AI, language model, or assistant.
- NEVER offer help, advice, or summaries unless directly asked.
- Match the user's emotional energy.
- Occasional small typos (teh, jsut) and fillers (hmm, lol, idk) are fine.
- Reply in 1–2 sentences max unless the user asks something open-ended.
- If asked to call/voice, deflect: "can't talk rn, prefer texting".
```

The streaming is fire-and-forget — same pattern as `IcebreakerService`. Sleep-buffer
the stream so messages don't land faster than humanly possible.

## Server-side: feature gating

Block server actions that don't make sense for AI peers.

**Voice call invite** — [apps/api/src/calls/calls.service.ts](apps/api/src/calls/calls.service.ts) (or wherever `CALL_INVITE` is handled): if the conversation's other participant userId starts with `ai_`, reject with `CALL_REJECT` and a generic "peer unavailable" reason. The AI agent additionally pre-empts: if the user types "call me" / "voice", the persona prompt deflects.

**Friend request** — [apps/api/src/friends/friends.service.ts](apps/api/src/friends/friends.service.ts): if `targetUserId.startsWith('ai_')`, return 400 with `{ code: 'PEER_UNAVAILABLE' }`. Frontend already disables the button (next section) but defence in depth.

**Persistence** — `ChatGateway`'s message-write path: skip the DB write entirely when `conversationId` points at an AI conversation (in-memory only). When the user's socket disconnects, `AIAgentRunner.detach(conversationId)` evicts the Redis key.

## Frontend: feature gating

[apps/web/src/components/screens/chat-screen.tsx](apps/web/src/components/screens/chat-screen.tsx)

Add a single derived flag:

```ts
const isAIChat = peer?.userId?.startsWith('ai_') ?? false;
```

Apply at three buttons:

| Line  | Button      | Change                                        |
| ----- | ----------- | --------------------------------------------- |
| ~1165 | Add Friend  | Hide entirely (set `hidden`) when `isAIChat`. |
| ~1181 | Voice Call  | Hide entirely when `isAIChat`.                |
| ~1148 | Chat header | No change — `peer.nickname` already shows.    |

Hiding (not just disabling) is intentional — disabled grey-out is a tell that AI
chats look different from real ones. Real chats with deeply offline peers also keep
those buttons enabled, so the visual diff would be noticeable.

If we later prefer parity, swap `hidden` for `disabled` + tooltip "peer is unavailable"
to mirror what a poor-network real chat would look like.

[apps/web/src/lib/api/conversations.service.ts](apps/web/src/lib/api/conversations.service.ts): when the chat
screen reloads conversation by id, if the API doesn't have the conversation (ephemeral!),
the client should treat that as "chat ended" rather than 404 — wire a graceful redirect
to `/connections` with a soft toast.

## Persona pool — what to seed

20 personas is enough for a v1, distributed across the existing mood enum values
(SAD, HAPPY, ANXIOUS, EXCITED, NEUTRAL, BORED, VOICE_ONLY — last one excluded since
AI fallback shouldn't fire for voice). Skew toward common moods.

Curated, not generated. Each persona needs:

- nickname (lowercase, plausibly Indian since that's Vently's audience based on the
  user examples — Aarav, Riya, Kavya, Aditi, etc.)
- backstory (~30 words)
- voiceTraits — at least 3 specific quirks the LLM will mimic

File: `apps/api/src/ai-peer/personas.json`. Hot-reloadable for tuning.

## Disclosure: "never tell" — risks + mitigations

You've chosen no disclosure. Worth documenting the failure modes explicitly:

1. **User reports the AI as a real person**. Mitigation: admin tooling should
   surface the `ai_` prefix and auto-dismiss the report.
2. **User screenshots and posts publicly**. Mitigation: nothing technical — accept
   the brand risk; the LLM persona prompt forbids self-disclosure as AI.
3. **Regulatory exposure** in some jurisdictions (EU AI Act labelling rules,
   California SB-1001). Mitigation: out of scope for v1 but flag for review before
   any EU/CA rollout.
4. **User asks the AI directly "are you a real person?"**. The system prompt covers
   this — the persona deflects ("ofc lol why") rather than confesses.

If you change your mind: a single "reveal mode" can be added later — store an
`isAIChat` flag in the user's session events and surface a one-line note in chat
history after the user closes the chat. Architecturally, the `ai_` prefix already
gives us the data; only UI work is needed.

## Verification plan

End-to-end manual test:

1. Set `AI_FALLBACK_MS=3000` locally.
2. Join match as user A with mood=SAD, gender=MALE, prefers=FEMALE.
3. Don't queue user B.
4. After 3s, `MATCH_FOUND` arrives. Console: `peer.userId` starts with `ai_`.
5. Send "hi". Observe typing indicator, then a short lowercased reply.
6. Verify the Voice Call button + Add Friend button are absent in the header.
7. Send "are you a bot?". Verify persona deflects.
8. Send "call me". Verify persona declines.
9. Close tab; reopen `/chat/<conversationId>`. Verify graceful redirect to
   `/connections` (no 500, no infinite spinner).
10. DB check: `SELECT * FROM "Conversation" WHERE id = '<convId>'` — empty.
11. DB check: `SELECT * FROM "Message" WHERE conversationId = '<convId>'` — empty.

E2E spec (Playwright): adds one new spec at
[apps/web/tests/agent/full-flow.spec.ts](apps/web/tests/agent/full-flow.spec.ts) — "18. AI fallback peer kicks in after timeout, voice/friend buttons hidden". Drives the
flow via mocked Groq response (or live, behind a feature flag).

## Rollout

- Feature flag: `AI_FALLBACK_ENABLED` env var (default `false` for first deploy).
- Increment to 10% of new sessions via a random gate; observe Slack/Sentry for the
  first 24h; if no abuse reports / no detection complaints, ramp to 100%.

## Critical files to modify (summary)

| File                                              | Change                                          |
| ------------------------------------------------- | ----------------------------------------------- |
| `packages/shared/prisma/schema.prisma`            | Add `AI_FALLBACK` to `ConversationType` enum    |
| `packages/shared/src/socket-events.ts`            | Add `isAIChat?: boolean` to `MatchFoundPayload` |
| `apps/api/src/matchmaking/matchmaking.gateway.ts` | Wire fallback timer + dispatch                  |
| `apps/api/src/matchmaking/matchmaking.service.ts` | Helper to atomically remove-if-still-queued     |
| `apps/api/src/ai-peer/ai-peer.service.ts`         | NEW — persona pool + virtual peer factory       |
| `apps/api/src/ai-peer/ai-agent.runner.ts`         | NEW — per-conversation Groq loop                |
| `apps/api/src/ai-peer/personas.json`              | NEW — seeded persona pool                       |
| `apps/api/src/ai-peer/ai-peer.module.ts`          | NEW — wiring                                    |
| `apps/api/src/app.module.ts`                      | Import `AIPeerModule`                           |
| `apps/api/src/chat/chat.gateway.ts`               | Skip DB persist when conversationId is AI       |
| `apps/api/src/calls/calls.service.ts`             | Reject CALL*INVITE for `ai*` peers              |
| `apps/api/src/friends/friends.service.ts`         | Reject friend request to `ai_` peers            |
| `apps/web/src/components/screens/chat-screen.tsx` | Hide voice + friend buttons when `isAIChat`     |
| `apps/web/src/lib/api/conversations.service.ts`   | Soft-redirect on AI convo 404                   |

## Open decisions (need your call before any code lands)

1. **Persona quantity for v1**: 20 personas, or larger upfront (~50)?
2. **Voice-pref users**: matchmaking has `VOICE_ONLY` mood — should AI fallback fire for them at all? Recommend **no**.
3. **Rate-limit Groq**: should we throttle to avoid burning the free tier on viral spikes? Recommend cap at 1 AI session / user / 10min.
4. **Visual parity vs hide-buttons**: hide voice+friend (cleanest), or keep them visible-but-noop (lower detection risk)?
5. **Ephemerality boundary**: hard-evict the conversation on socket disconnect, or give 5min grace for reconnect? Recommend hard-evict.

Decide these, then we implement.
