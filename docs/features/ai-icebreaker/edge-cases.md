# Edge Cases — AI Ice-breaker

## Critical (must handle before shipping)

### EC-1: Claude API unavailable / timeout

**Scenario:** Anthropic API is down or takes > 8 seconds.  
**Risk:** Blocks the match flow if we `await` the result.  
**Mitigation:** `generate()` is called fire-and-forget (no `await`) in `MatchmakingService`.
An internal `AbortController` with an 8-second timeout aborts the stream. Catch block
logs a warning and returns early. Match is never affected.  
**Test:** Mock Claude client to throw; assert `match:found` was emitted and no
`chat:icebreaker:chunk` events were emitted.

---

### EC-2: User navigates away before ice-breaker streams

**Scenario:** User sees the match popup, clicks a link, or closes the tab before
the stream finishes.  
**Risk:** Partial message lost; user never sees it.  
**Mitigation:** When the stream completes (or is cut short), the full accumulated
text is persisted as a `Message(type=SYSTEM)` row. On reconnect, the standard
`GET /conversations/:id/messages` history load returns it. The user sees the
ice-breaker even if they missed the stream.  
**Test:** Simulate user disconnect mid-stream; verify row exists in DB at stream end.

---

### EC-3: User reconnects mid-stream

**Scenario:** A socket reconnect happens while tokens are still arriving.  
**Risk:** Client misses early chunks; ice-breaker appears truncated.  
**Mitigation:** On `chat:join` (reconnect), the client immediately fetches message
history via REST. If the stream is still in progress, the client will not have a
`chat:icebreaker:done` event yet — the `IcebreakerBubble` component stays visible
and accumulates only the chunks received after reconnect. The REST history will fill
in the gap once the stream is complete and the row is persisted.  
**Note:** This means a reconnected user may see the typing animation start late and
the final message appear abruptly. Acceptable for v1.

---

### EC-4: Both users are in the queue simultaneously (rapid re-match)

**Scenario:** User ends a match and immediately re-queues, getting matched again
before the first ice-breaker stream finishes.  
**Risk:** `generate()` for the old conversation is still running; it persists the
message and emits to the old room — harmless, but wastes tokens.  
**Mitigation:** No fix needed — the old conversation room is inactive, the emit
hits an empty room, and the DB row is orphaned. Not user-visible. Add a guard in
v2 to cancel an in-flight stream if the conversation is `endedAt !== null`.

---

### EC-5: Inappropriate or harmful Claude output

**Scenario:** Despite the system prompt, Claude generates something offensive,
sexually suggestive, or doxing.  
**Risk:** Harmful content appears in chat and is stored in the DB.  
**Mitigation:** Run the complete accumulated text through `ModerationService.check()`
before persisting or emitting `chat:icebreaker:done`. On `SEVERE`, discard the output
entirely (no emit, no DB row). On `MILD`, allow through but write a `ModerationFlag` row.  
**Test:** Inject a fixture response containing a known SEVERE word; assert no
`chat:icebreaker:done` is emitted.

---

### EC-6: `ANTHROPIC_API_KEY` not set (local dev / staging)

**Scenario:** Developer runs the app locally without configuring the API key.  
**Risk:** Crashes on startup or on every match.  
**Mitigation:** `IcebreakerService.onModuleInit()` checks for the key. If missing,
sets `this.enabled = false` and logs a warning. `generate()` is a no-op. Identical
pattern to `PushService`.

---

## Medium (handle before v1 or document as known limitation)

### EC-7: One or both bios are empty

**Scenario:** User skipped the bio field during onboarding.  
**Risk:** Prompt is too sparse; Claude generates a generic opener.  
**Mitigation:** The prompt template handles `bio | "not provided"` gracefully.
The system instruction explicitly tells Claude to rely on mood + time of day when bio
is absent. Output will be slightly less personalized but still valid.

---

### EC-8: Both users have the same bio (copy-paste or default text)

**Scenario:** Two users both have "Here to chat" as bio.  
**Risk:** Ice-breaker sounds too tailored to generic text.  
**Mitigation:** Acceptable for v1 — the mood + time-of-day signal is still useful.
Add deduplication of identical bios in v2 if needed.

---

### EC-9: Bio contains PII (email, phone, real name)

**Scenario:** User typed their email in their bio. We're about to send it to Anthropic.  
**Risk:** PII leaves our system.  
**Mitigation:** Strip email and phone patterns from bio before building the prompt
(regex: `[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}` and `\+?[\d\s\-().]{7,15}`).
Log a warning when stripping occurs.

---

### EC-10: Conversation ended before stream completes (one user blocked/left)

**Scenario:** User A blocks User B 1 second after matching, before ice-breaker arrives.  
**Risk:** Ice-breaker is persisted in an ended conversation; User B might see it
when they reload even though the match is over.  
**Mitigation:** After stream + persist, check `Conversation.endedAt`. If already set,
delete the just-inserted Message row. The `chat:icebreaker:done` emit will have already
gone out to a now-empty room — harmless.

---

### EC-11: Claude returns an empty string

**Scenario:** API call succeeds but content is blank.  
**Risk:** An empty system message appears in chat.  
**Mitigation:** After stream, trim the accumulated text. If `length === 0`, skip
persist and emit. Log a warning.

---

### EC-12: Very long bio causes prompt to exceed token budget

**Scenario:** User bio is 280 characters (max). Combined with system prompt, we might
approach the model's context limit or inflate cost.  
**Risk:** Minor — claude-sonnet-4-6 has a 200k context window; 280 chars is trivial.
But we should still truncate bios in the prompt to 150 chars to be defensive.  
**Mitigation:** Truncate each bio to 150 chars in `buildPrompt()`.

---

## Low (post-v1 backlog)

| #     | Scenario                                                        | Plan                                                                                                    |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| EC-13 | High match volume spikes Anthropic cost                         | Add per-minute rate limit on `generate()` calls using Redis counter; skip ice-breaker if limit exceeded |
| EC-14 | VOICE_ONLY mood matches go to `/call` directly — no chat screen | Skip ice-breaker entirely for `VOICE_ONLY` matches (check mood in `generate()`)                         |
| EC-15 | Same mood pair matched repeatedly (seed users in testing)       | Cached prompt responses for identical `(moodA, moodB, timeOfDay)` tuples in Redis; TTL 5 min            |
| EC-16 | User wants to regenerate / dismiss the ice-breaker              | Post-v1 UX feature; requires new socket event + UI button                                               |
