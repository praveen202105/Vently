# Vently — Future Feature Roadmap

_Last updated: May 28, 2026. Covers everything discussed during the SDE2 enhancement session and post-session work._

---

## ✅ Already Shipped (this session)

| Feature | Description |
|---------|-------------|
| **AI Ice-breaker** | Groq `llama-3.1-8b-instant` streams a conversation-opener the moment a match is made. Fades away after reading — nothing persists in chat history. |
| **Smart Reply Chips** | 3 short reply suggestions generated after each peer message. Mood-aware (FLIRTY → playful, LONELY → empathetic, etc.). Tap to auto-send. |
| **Web Push Notifications** | VAPID push when peer messages and tab is backgrounded. |
| **Emoji Reactions** | Long-press / hover any message to react with 6 emoji. Real-time fan-out. |
| **Message Timestamps** | Cluster-aware — shown once per sender run or after a 5-min gap. |
| **Friend Request Banner** | Inline Accept / Reject banner in active chat when peer sends a friend request. |
| **"You've Met Before" Reunion Banner** | When two strangers get matched again (same pair, different session), shows a dismissible banner at the top of the chat (timestamp-only for privacy). |
| **Typing Indicator — Peer Name** | Displays peer's actual name in FRIEND chats (e.g. "Praveen is typing...") with a slide-in animation. |
| **Message Search** | Full-text search within a conversation's message history via case-insensitive query with match highlighting. |
| **Unread Badge on Tab Title** | Updates document `<title>` to display `(X) Vently` when there are unread messages and the tab is backgrounded/not focused. |
| **Smart Matching Score** | Beyond mood-only: factors in bio similarity (Groq text-embedding-ada-002 vectors stored in Postgres), active-hour overlap, and past conversation length. Rewrote matchmaking queue selection with a composite score. `EmbeddingService` + Prisma migration for `bioEmbedding` float[] column. All 17 Playwright agent E2E tests pass. |
| **Auto-Detect Language + Translate Chips** | Peer messages show a 🌐 **Translate** button. One tap calls `POST /conversations/:cid/messages/:mid/translate` (Groq `llama-3.1-8b-instant`) — detects source language, returns translated body + 3 localized reply chips in the viewer's browser locale. Translation is ephemeral (never stored). Chips update inline. Toggle back to original with "Show original". No new DB schema, no `franc` bundle dep. |

---

## 🔜 High Priority (Next Sprint)

### 1. Mood Analytics Dashboard (`/insights`) (formerly #6)
Show the user: which moods they've matched under most, average conversation length per mood, most-used reply chips. Bar chart + sparkline.
- **Stack**: Aggregate queries in Prisma, Recharts on frontend.
- **Effort**: 1–2 days.

### 2. Add `matchMood` to ConversationParticipant
Store the mood used at match-time so it's stable even if the user changes their profile mood mid-conversation. Needs Prisma migration.
- **Effort**: 0.5 day.

---

## 🗓 Medium Priority

### 4. Reputation / Trust Score (formerly #8)
Each user accumulates a score based on: conversation length, reactions received, friend requests accepted. Shown as a subtle badge on profile. Used to surface higher-quality matches first.
- **Effort**: 1 day backend + 0.5 day frontend.

---

## 🔭 Low Priority / Exploratory

### 6. Group Mood Rooms (3–5 people) (formerly #9)
Queue into a "room" instead of 1:1. Shared ice-breaker for the whole group. Harder moderation surface.
- **Effort**: Large — schema change, gateway rewrite.

### 7. Voice Message Support (formerly #10)
Record a short voice note (≤30s) via `MediaRecorder`, upload to S3/Railway bucket, play inline with waveform visualization.
- **Stack**: Railway bucket (already in the project), `wavesurfer.js`.
- **Effort**: 2–3 days.

### 8. Scheduled "Night Owl" Matchmaking (formerly #11)
Users opt in to a 11 PM–2 AM window. Matching only happens at night, with LATE_NIGHT mood auto-selected. Could be a cron-triggered queue flush.
- **Effort**: 0.5 day.

### 9. AI Relationship Archetype (formerly #12)
After 5+ messages, silently classify the conversation tone (mentor/mentee, peers venting, flirty banter, etc.) and surface it as a subtle label. Uses Groq with a classification prompt.
- **Why SDE2-level**: Real-time ML inference woven into product.
- **Effort**: 1 day.

---

## 🛠 Technical Debt / Infra

| Item | Notes | Status |
|------|-------|--------|
| **Rotate GROQ_API_KEY** | Current key is exposed in session history. Get a new one at console.groq.com and update Railway env. | ⏳ Pending |
| **Merge `feat/ai-icebreaker` → `main`** | Branch has 8+ commits ready to merge. | ⏳ Pending |
| **Playwright E2E — full agent suite** | 17-test `full-flow.spec.ts` suite verified locally (matchmaking, chat, WebRTC, friends, blocking, search). | ✅ Done |
| **Playwright E2E for ice-breaker bubble** | Add assertion on `data-testid="icebreaker-bubble"` in `02-chat-flow.spec.ts`. | ⏳ Pending |
| **Unit tests for SuggestionsService** | Mirror the `icebreaker.service.spec.ts` pattern — mock Groq client, test each mood instruction, test JSON parse fallback. | ⏳ Pending |
| **CORS_ORIGIN update** | When new Vercel preview URLs are created, update Railway env or switch to a wildcard pattern for `*.vercel.app` in dev. | ⏳ Pending |
| **pnpm upgrade** | pnpm 9 → 11 (prompted during Railway build). Low risk, run `corepack install -g pnpm@11.3.0`. | ⏳ Pending |
| **Vercel production deploy** | `vercel deploy --prebuilt` failed with ENOENT on `next-server`. Needs `vercel build` run from monorepo root instead. | ⏳ Pending |

---

## Feature Priority Matrix

```
                HIGH IMPACT
                    │
   Smart matching   │  Reunion banner [x]
   score [x]        │  
                    │
LOW EFFORT ─────────┼───────── HIGH EFFORT
                    │
   Unread tab       │  Group rooms (6)
   title [x]        │  Voice messages (7)
                    │
                LOW IMPACT
```

---

## Key Insights

**Stranger Conversation Storage** (confirmed via `conversations.repository.ts`):
- `leaveConversation` → sets `endedAt` timestamp only, **never deletes** the record or messages
- All DIRECT (stranger) conversation messages are permanently stored in Postgres
- Makes the Reunion Banner feasible with **zero schema changes**

**E2EE vs AI Features — Architectural Conflict**:
- True E2EE = server never reads message content → AI summaries impossible
- Vently currently stores messages as plain text (no E2EE)
- Decision: **never send stored message content to third-party AI** (Groq) to preserve user trust in an anonymous app
- Any future AI feature that touches message history must go through a privacy review first
