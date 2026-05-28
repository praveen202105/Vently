# Implementation Plan — AI Ice-breaker

Total estimated effort: **2–3 days** for a senior dev.  
Work is organized in 5 phases. Each phase is independently shippable (CI stays green).

---

## Phase 0: Setup (30 min)

### 0.1 Install SDK

```bash
pnpm --filter @vently/api add groq-sdk
```

### 0.2 Add env var

In `apps/api/.env` (local) and Railway dashboard (prod):

```
GROQ_API_KEY=gsk_...        # free at console.groq.com — no credit card needed
```

Add to `apps/api/.env.example`:

```
# AI ice-breaker (optional — feature disabled if missing)
# Get a free key at https://console.groq.com
GROQ_API_KEY=
```

### 0.3 Add to turbo.json env allowlist

In `turbo.json` → `build.env` array, add `"GROQ_API_KEY"`.

---

## Phase 1: Shared contracts (20 min)

**File:** [packages/shared/src/socket-events.ts](../../../../packages/shared/src/socket-events.ts)

Add two new constants to `SocketEvents`:

```ts
CHAT_ICEBREAKER_CHUNK: 'chat:icebreaker:chunk',
CHAT_ICEBREAKER_DONE:  'chat:icebreaker:done',
```

Add payload interfaces:

```ts
export interface ChatIcebreakerChunkPayload {
  conversationId: string;
  chunk: string;
}

export interface ChatIcebreakerDonePayload {
  conversationId: string;
}
```

Add to `ServerToClientEvents` map:

```ts
[SocketEvents.CHAT_ICEBREAKER_CHUNK]: (p: ChatIcebreakerChunkPayload) => void;
[SocketEvents.CHAT_ICEBREAKER_DONE]:  (p: ChatIcebreakerDonePayload) => void;
```

Build the shared package so types are emitted:

```bash
pnpm --filter @vently/shared build
```

---

## Phase 2: Backend — IcebreakerModule (4–5 hours)

### 2.1 Create `apps/api/src/icebreaker/icebreaker.prompt.ts`

```ts
import type { MoodIntent } from '@vently/shared';

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 6) return 'late night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

// Strip email + phone patterns to avoid sending PII to Anthropic
function sanitizeBio(bio: string | null): string {
  if (!bio) return 'not provided';
  return bio
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\+?[\d\s\-().]{7,15}/g, '[phone]')
    .slice(0, 150);
}

export function buildPrompt(
  moodA: MoodIntent,
  bioA: string | null,
  moodB: MoodIntent,
  bioB: string | null,
): { system: string; user: string } {
  return {
    system: `You are an empathetic assistant for Vently, an anonymous chat app.
Write a single ice-breaker (1–2 sentences, ≤ 80 words) to help two matched strangers start a real conversation.
Rules:
- Never reveal one user's bio to the other.
- Never mention names, genders, ages, or any identifying detail.
- Be warm, curious, and specific to their shared mood.
- Do NOT start with "Hey", "Hi", or "Hello".
- Output only the ice-breaker text — no preamble, no explanation.`,
    user: `User A mood: ${moodA}
User A bio: ${sanitizeBio(bioA)}
User B mood: ${moodB}
User B bio: ${sanitizeBio(bioB)}
Time of day: ${timeOfDay()}`,
  };
}
```

### 2.2 Create `apps/api/src/icebreaker/icebreaker.service.ts`

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { SocketEvents } from '@vently/shared';
import { buildPrompt } from './icebreaker.prompt.js';
import type { MoodIntent } from '@vently/shared';

interface GenerateParams {
  conversationId: string;
  userA: { mood: MoodIntent; bio: string | null };
  userB: { mood: MoodIntent; bio: string | null };
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
  ) {}

  onModuleInit() {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (!key) {
      this.logger.warn(
        'GROQ_API_KEY missing — ice-breaker disabled. Get a free key at console.groq.com',
      );
      return;
    }
    this.client = new Groq({ apiKey: key });
    this.logger.log('Ice-breaker service enabled (Groq / llama-3.1-8b-instant)');
  }

  // Fire-and-forget — never awaited by the caller
  async generate(params: GenerateParams): Promise<void> {
    if (!this.client) return;

    const { conversationId, userA, userB, socketServer } = params;
    const room = `conv:${conversationId}`;
    const { system, user } = buildPrompt(userA.mood, userA.bio, userB.mood, userB.bio);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    let accumulated = '';

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: 'llama-3.1-8b-instant',
          max_tokens: 120,
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
      this.logger.warn(`Ice-breaker stream failed: ${(err as Error).message}`);
      // Do not rethrow — match must not be broken
      if (!accumulated) return;
      // If we got partial content before the error, still try to persist + emit done
    }

    accumulated = accumulated.trim();
    if (!accumulated) return;

    // Moderation check on the full output
    const modResult = this.moderation.check(accumulated);
    if (modResult.severity === 'SEVERE') {
      this.logger.warn('Ice-breaker output rejected by moderation');
      return;
    }

    // Check conversation hasn't ended (block/leave race)
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { endedAt: true },
    });
    if (conv?.endedAt) return;

    // Persist as SYSTEM message
    await this.prisma.message.create({
      data: {
        conversationId,
        senderId: null,
        body: accumulated,
        type: 'SYSTEM',
      },
    });

    socketServer.to(room).emit(SocketEvents.CHAT_ICEBREAKER_DONE, { conversationId });
  }
}
```

### 2.3 Create `apps/api/src/icebreaker/icebreaker.module.ts`

```ts
import { Module } from '@nestjs/common';
import { IcebreakerService } from './icebreaker.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';

@Module({
  imports: [PrismaModule, ModerationModule],
  providers: [IcebreakerService],
  exports: [IcebreakerService],
})
export class IcebreakerModule {}
```

### 2.4 Wire into `app.module.ts`

Add `IcebreakerModule` to the imports array.

### 2.5 Inject into `matchmaking.service.ts`

In `MatchmakingService.createMatch()`, after emitting `match:found` to both users:

```ts
// Fire-and-forget — never await
void this.icebreaker.generate({
  conversationId: conversation.id,
  userA: { mood: userAProfile.mood, bio: userAProfile.bio },
  userB: { mood: userBProfile.mood, bio: userBProfile.bio },
  socketServer: this.server, // RealtimeGateway's socket server, already available
});
```

Skip for `VOICE_ONLY` mood (both users go to `/call` directly, no chat screen):

```ts
if (userAProfile.mood !== MoodIntent.VOICE_ONLY) {
  void this.icebreaker.generate({ ... });
}
```

---

## Phase 3: Frontend — Streaming UI (3–4 hours)

### 3.1 Extend chatStore (`apps/web/src/stores/chat-store.ts`)

Add fields:

```ts
icebreakerChunks: string[];
icebreakerDone: boolean;
```

Add actions:

```ts
appendIcebreakerChunk: (chunk: string) => void;
finalizeIcebreaker: () => void;
```

### 3.2 Subscribe to new events in `chat-screen.tsx`

```ts
useSocketEvent(SocketEvents.CHAT_ICEBREAKER_CHUNK, ({ conversationId, chunk }) => {
  if (conversationId !== params.id) return;
  appendIcebreakerChunk(chunk);
});

useSocketEvent(SocketEvents.CHAT_ICEBREAKER_DONE, ({ conversationId }) => {
  if (conversationId !== params.id) return;
  finalizeIcebreaker();
});
```

### 3.3 Create `IcebreakerBubble` component

New file: `apps/web/src/components/chat/icebreaker-bubble.tsx`

```tsx
'use client';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  chunks: string[];
  done: boolean;
}

export function IcebreakerBubble({ chunks, done }: Props) {
  const text = chunks.join('');
  if (!text && done) return null; // stream complete + persisted as chat:message

  return (
    <AnimatePresence>
      {text && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mx-auto my-3 max-w-sm rounded-2xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-center text-sm text-violet-200"
        >
          <span className="block text-[10px] uppercase tracking-widest text-violet-400 mb-1">
            Vently suggests
          </span>
          {text}
          {!done && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-violet-300" />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### 3.4 Render in `chat-screen.tsx`

Place `<IcebreakerBubble>` above the message list, below the header:

```tsx
<IcebreakerBubble chunks={icebreakerChunks} done={icebreakerDone} />
```

When `chat:message` arrives with `type === 'SYSTEM'` (the persisted message),
the standard message list renders it. The `IcebreakerBubble` can remain or fade
out on `done` — both look good.

---

## Phase 4: Tests (2 hours)

### 4.1 Unit test — `IcebreakerService`

File: `apps/api/src/icebreaker/icebreaker.service.spec.ts`

- Mock `Anthropic` client to yield 3 chunks then end.
- Assert `socketServer.to().emit()` called 3 times with `CHAT_ICEBREAKER_CHUNK`.
- Assert `CHAT_ICEBREAKER_DONE` emitted once.
- Assert `prisma.message.create()` called with correct body.

- Mock client to throw → assert no emit, no DB write, no thrown error propagated.
- Mock moderation to return SEVERE → assert no emit, no DB write.
- Mock `conversation.endedAt = new Date()` → assert no DB write, no emit.

### 4.2 E2E test addition

File: `apps/web/tests/e2e/02-chat-flow.spec.ts`  
Add assertion after match:

```ts
// Ice-breaker appears within 5s
await expect(page.locator('[data-testid="icebreaker-bubble"]')).toBeVisible({ timeout: 5_000 });
```

Add `data-testid="icebreaker-bubble"` to `IcebreakerBubble` component.

---

## Phase 5: Observability (30 min)

In `IcebreakerService.generate()`:

```ts
// Log on every call for cost tracking
this.logger.log({
  event: 'icebreaker.generated',
  conversationId,
  tokenCount: accumulated.split(' ').length, // rough estimate
  durationMs: Date.now() - startedAt,
});
```

In `matchmaking.service.ts` where we call `generate()`:

```ts
this.logger.log({ event: 'icebreaker.triggered', conversationId, mood: userAProfile.mood });
```

---

## Phase Summary

| Phase            | Files changed / created                                            | Time          |
| ---------------- | ------------------------------------------------------------------ | ------------- |
| 0. Setup         | `.env.example`, `turbo.json`, install `groq-sdk`                   | 30 min        |
| 1. Contracts     | `packages/shared/src/socket-events.ts`                             | 20 min        |
| 2. Backend       | `icebreaker/` (3 files), `app.module.ts`, `matchmaking.service.ts` | 4–5 h         |
| 3. Frontend      | `chat-store.ts`, `chat-screen.tsx`, `icebreaker-bubble.tsx`        | 3–4 h         |
| 4. Tests         | `icebreaker.service.spec.ts`, `02-chat-flow.spec.ts`               | 2 h           |
| 5. Observability | `icebreaker.service.ts` log calls                                  | 30 min        |
| **Total**        |                                                                    | **~2–3 days** |
