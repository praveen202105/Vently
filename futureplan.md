# Vently — Future Feature Roadmap

_Last updated: May 2026 (revised). Covers everything discussed during the SDE2 enhancement session._

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

---

## 🔜 High Priority (Next Sprint)

### 1. ~~AI Conversation Summary on End~~ — Dropped
~~Show a summary on the connections card after conversation ends.~~
**Reason removed:** DIRECT (stranger) conversations don't appear in `/connections` unless the user saved the person as a friend. If they did save them, they already remember who they are — the summary adds no value. Low real-world utility.

**Replaced by → #1b below.**

### 1b. "You've Met Before" Reunion Banner
When two strangers get matched **again** (same pair, different session), show a dismissible banner at the top of the chat:

> _"You two chatted 3 days ago · May 23, 11:43 PM"_

- **Privacy decision**: Show **timestamp only** — no AI summary of message content.
  - Generating a summary requires sending past messages to Groq (a third party), which conflicts with user expectation of anonymity in an anonymous chat app.
  - True E2EE and server-side AI summaries are fundamentally incompatible — server can't both "never see messages" and "summarize them".
  - Timestamp alone still delivers the core UX value (the reunion moment) without any privacy tradeoff.
- **Why it works**: Stranger conversations are **not deleted on End** — only `endedAt` is stamped. All messages remain in DB. Zero schema changes needed.
- **How it works**:
  1. In matchmaking, before creating a new conversation, query for a prior `DIRECT` conversation between the two `userId` pairs with `endedAt IS NOT NULL`
  2. If found → include `lastMetAt: conversation.endedAt` in the `MATCH_FOUND` payload (no message content touched)
  3. Frontend shows a subtle dismissible pill at top of chat with relative time ("3 days ago")
- **Why SDE2-level**: Cross-session memory, privacy-aware design decision, thoughtful UX tradeoff — exactly the kind of thinking interviewers look for.
- **Stack**: Single Prisma query in matchmaking service, `MATCH_FOUND` payload extension, frontend banner component.
- **Effort**: ~half day.

### 2. Typing Indicator — Peer Name
Currently shows "typing…" with no name. For FRIEND conversations (where peer name is known), show "Praveen is typing…".
- **Effort**: 30 min frontend-only.

### 3. Message Search
Full-text search within a conversation's message history. Highlight matches.
- **Stack**: Postgres `ILIKE` or `tsvector` index, new API endpoint, frontend search input in header.
- **Effort**: ~half day.

### 4. Unread Badge on Tab Title
Show `(3) Vently` in `<title>` when there are unread messages and the tab is not focused.
- **Effort**: 1 hour frontend-only.

---

## 🗓 Medium Priority

### 5. Smart Matching Score
Beyond mood-only matching — factor in bio similarity, active hours, past conversation length. Use a lightweight embedding (Groq or local) to score bio overlap.
- **Why SDE2-level**: Vector similarity, scoring algorithm, queue rewrite.
- **Effort**: 2–3 days.

### 6. Mood Analytics Dashboard (`/insights`)
Show the user: which moods they've matched under most, average conversation length per mood, most-used reply chips. Bar chart + sparkline.
- **Stack**: Aggregate queries in Prisma, Recharts on frontend.
- **Effort**: 1–2 days.

### 7. Auto-Detect Language + Translate Chips
If the peer is writing in a different language (detected via `franc` or Groq), offer "Translate" button on their messages. Generate chips in the user's own language.
- **Why SDE2-level**: i18n, LLM integration, UX edge-case thinking.
- **Effort**: 1–2 days.

### 8. Reputation / Trust Score
Each user accumulates a score based on: conversation length, reactions received, friend requests accepted. Shown as a subtle badge on profile. Used to surface higher-quality matches first.
- **Effort**: 1 day backend + 0.5 day frontend.

---

## 🔭 Low Priority / Exploratory

### 9. Group Mood Rooms (3–5 people)
Queue into a "room" instead of 1:1. Shared ice-breaker for the whole group. Harder moderation surface.
- **Effort**: Large — schema change, gateway rewrite.

### 10. Voice Message Support
Record a short voice note (≤30s) via `MediaRecorder`, upload to S3/Railway bucket, play inline with waveform visualization.
- **Stack**: Railway bucket (already in the project), `wavesurfer.js`.
- **Effort**: 2–3 days.

### 11. Scheduled "Night Owl" Matchmaking
Users opt in to a 11 PM–2 AM window. Matching only happens at night, with LATE_NIGHT mood auto-selected. Could be a cron-triggered queue flush.
- **Effort**: 0.5 day.

### 12. AI Relationship Archetype
After 5+ messages, silently classify the conversation tone (mentor/mentee, peers venting, flirty banter, etc.) and surface it as a subtle label. Uses Groq with a classification prompt.
- **Why SDE2-level**: Real-time ML inference woven into product.
- **Effort**: 1 day.

---

## 🛠 Technical Debt / Infra

| Item | Notes |
|------|-------|
| **Rotate GROQ_API_KEY** | Current key is exposed in session history. Get a new one at console.groq.com and update Railway env. |
| **Merge `feat/ai-icebreaker` → `main`** | Branch has 8+ commits ready to merge. |
| **Playwright E2E for ice-breaker** | Add assertion on `data-testid="icebreaker-bubble"` in `02-chat-flow.spec.ts`. |
| **Unit tests for SuggestionsService** | Mirror the `icebreaker.service.spec.ts` pattern — mock Groq client, test each mood instruction, test JSON parse fallback. |
| **Add `matchMood` to ConversationParticipant** | Store the mood used at match-time so it's stable even if the user changes their profile mood mid-conversation. Needs Prisma migration. |
| **CORS_ORIGIN update** | When new Vercel preview URLs are created, update Railway env or switch to a wildcard pattern for `*.vercel.app` in dev. |
| **pnpm upgrade** | pnpm 9 → 11 (prompted during Railway build). Low risk, run `corepack install -g pnpm@11.3.0`. |

---

## Feature Priority Matrix

```
                HIGH IMPACT
                    │
   Smart matching   │  Reunion banner
   score (5)        │  (1b) ← do next
                    │
LOW EFFORT ─────────┼───────── HIGH EFFORT
                    │
   Unread tab       │  Group rooms (9)
   title (4)        │  Voice messages (10)
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
