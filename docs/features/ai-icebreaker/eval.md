# Evaluation Plan — AI Ice-breaker

How we know this feature is working correctly, safely, and performantly.

---

## 1. Correctness

### 1.1 Happy path
| Check | How to verify |
|---|---|
| Ice-breaker appears after match | Open two browsers, match two users, observe streaming text in chat within 3s |
| Both users see the same text | Compare text in both browser windows |
| Text is persisted in DB | `pnpm db:studio` → Messages table → filter `type = SYSTEM`, `senderId = null` |
| Reconnecting user sees ice-breaker | Disconnect one socket mid-stream, reconnect, open `/conversations/:id/messages` — row present |
| `IcebreakerBubble` fades after `chat:message` arrives | Visual check — bubble disappears, message renders in list |

### 1.2 Degraded path
| Check | How to verify |
|---|---|
| `ANTHROPIC_API_KEY` not set | Remove key from `.env`, restart api, match two users — match works, no ice-breaker, no crash |
| Claude API timeout | Point `ANTHROPIC_API_KEY` at a non-existent endpoint; match still completes |
| VOICE_ONLY match skips ice-breaker | Match two users on VOICE_ONLY mood — no `chat:icebreaker:chunk` events in Network tab |

---

## 2. Unit Tests (automated, run in CI)

File: `apps/api/src/icebreaker/icebreaker.service.spec.ts`

| Test | Assertion |
|---|---|
| Happy path: 3-chunk stream | `CHAT_ICEBREAKER_CHUNK` emitted 3×, `CHAT_ICEBREAKER_DONE` emitted 1×, `prisma.message.create` called with correct body |
| Claude throws | No emit, no DB write, no exception propagated |
| Claude returns empty string | No emit, no DB write |
| Moderation SEVERE | No emit, no DB write |
| Conversation already ended | No DB write, no `CHAT_ICEBREAKER_DONE` |
| Key not set (`enabled = false`) | `generate()` returns immediately, no API call |
| Bio PII stripping | `buildPrompt` called with email replaced by `[email]` |

Target: **100% line coverage** on `icebreaker.service.ts` and `icebreaker.prompt.ts`.

---

## 3. E2E Tests (Playwright)

File: `apps/web/tests/e2e/02-chat-flow.spec.ts`

Add to the existing match+chat scenario:

```ts
test('ice-breaker appears after match', async ({ browser }) => {
  // existing match setup...
  await expect(
    alicePage.locator('[data-testid="icebreaker-bubble"]')
  ).toBeVisible({ timeout: 5_000 });

  await expect(
    bobPage.locator('[data-testid="icebreaker-bubble"]')
  ).toBeVisible({ timeout: 5_000 });

  // Text is the same on both sides
  const aliceText = await alicePage
    .locator('[data-testid="icebreaker-bubble"]').textContent();
  const bobText = await bobPage
    .locator('[data-testid="icebreaker-bubble"]').textContent();
  expect(aliceText).toBe(bobText);
});
```

---

## 4. Performance

| Metric | Target | How to measure |
|---|---|---|
| Time from `match:found` emit to first `CHAT_ICEBREAKER_CHUNK` | ≤ 1 s p95 | Log `startedAt` in `generate()`, log on first chunk |
| Total stream duration (first chunk → `CHAT_ICEBREAKER_DONE`) | ≤ 3 s p95 | Log duration in `generate()` on stream end |
| Match flow unaffected (no latency added) | `match:found` arrives in same time as before | Compare p99 of `match:found` emit latency from logs before/after deploy |

Logs to add in `IcebreakerService`:
```ts
logger.log({ event: 'icebreaker.first_chunk', ms: Date.now() - startedAt });
logger.log({ event: 'icebreaker.done', ms: Date.now() - startedAt, tokens: roughCount });
```

---

## 5. Safety / Moderation

| Check | How to verify |
|---|---|
| SEVERE words in Claude output are discarded | Unit test (see §2 above) |
| Mild-flagged outputs still go through (but leave a `ModerationFlag` row) | Unit test |
| Bio PII stripped before leaving our system | Unit test on `buildPrompt()` with email in bio |

Manual red-teaming: craft a bio with a known SEVERE term, force a match, verify no ice-breaker appears and `ModerationFlag` row has `action = BLOCKED`.

---

## 6. Cost Tracking

After 100 matches in production, query logs for `event = 'icebreaker.generated'` and calculate:
- Average tokens per call (target ≤ 120)
- Total monthly cost = `matchCount × avgTokens × $0.000003/token`
- At 1000 matches/month: ~$0.36/month — well within acceptable range

If volume grows past 100k matches/month, evaluate Redis caching of responses for identical `(moodA, moodB, timeOfDay)` tuples (EC-15 in edge-cases.md).

---

## 7. Rollback Plan

The feature is behind an env var (`ANTHROPIC_API_KEY`). Rollback = remove the key on Railway.
No DB migration to undo. No schema change. Existing `Message(type=SYSTEM)` rows from the
ice-breaker are harmless and don't need cleanup.

---

## 8. Definition of Done

- [ ] Unit tests pass (`pnpm --filter @vently/api test`)
- [ ] E2E test passes locally (`pnpm --filter @vently/web test:e2e`)
- [ ] TypeScript check passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Manual smoke test: two browsers match → streaming text visible → both see same text
- [ ] Manual degradation test: remove API key → match still works
- [ ] `ANTHROPIC_API_KEY` added to Railway env
- [ ] PR description links to this eval doc
