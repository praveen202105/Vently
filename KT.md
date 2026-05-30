# Vently — Knowledge Transfer Doc

A from-zero guide to the Vently codebase. Read top-to-bottom and you should be able to find any file, understand any feature, and ship a new one within a day.

**Last updated:** 2026-05-30. Covers production state through commit `f09fa98` (`feat(ai-chat): tune late night persona timing`) and the AI chat personalization/RAG work deployed to Railway.

> If you only have 5 minutes, read [§1 What is this](#1-what-is-this), [§3 Tech stack](#3-tech-stack), and [§4 Repo layout](#4-repo-layout). That gets you 80% of the orientation.

---

## Table of contents

1. [What is this](#1-what-is-this)
2. [Live URLs + accounts](#2-live-urls--accounts)
3. [Tech stack](#3-tech-stack)
4. [Repo layout](#4-repo-layout)
5. [Run it locally](#5-run-it-locally)
6. [Feature walkthroughs](#6-feature-walkthroughs)
   - [6.1 Auth](#61-auth-register--login--refresh)
   - [6.2 Onboarding + profile](#62-onboarding--profile)
   - [6.3 Matchmaking](#63-matchmaking)
   - [6.4 Realtime chat](#64-realtime-chat)
   - [6.5 Voice calling](#65-voice-calling-webrtc)
   - [6.6 Friends + blocks](#66-friends--blocks)
   - [6.7 Notifications](#67-notifications)
   - [6.8 Safety: report + profanity](#68-safety-report--profanity)
   - [6.9 AI fallback + chat personalization RAG](#69-ai-fallback--chat-personalization-rag)
   - [6.10 Chat intelligence + polish](#610-chat-intelligence--polish)
7. [Data model (Prisma schema)](#7-data-model-prisma-schema)
8. [REST API reference](#8-rest-api-reference)
9. [Socket event reference](#9-socket-event-reference)
10. [File map — where to find what](#10-file-map--where-to-find-what)
11. [Common tasks (how do I…)](#11-common-tasks-how-do-i)
12. [Testing](#12-testing)
13. [Deployment](#13-deployment)
14. [Troubleshooting](#14-troubleshooting)
15. [Glossary](#15-glossary)

---

## 1. What is this

**Vently** is an anonymous emotional chat + voice calling app. Users pick a mood and get matched 1:1 with someone in the same vibe. They can chat in real time, switch to a voice call, save the person as a friend, and reconnect later. If no human match arrives quickly, an invisible AI fallback peer can keep the chat flowing. Block / report flows keep things safe.

Headline user flow:

```
Register → Onboard (nickname + gender + 18+) → Pick a mood
       → Get matched with opposite gender in same mood
       → Realtime chat / voice call
       → If no human is around, AI fallback opens an ephemeral chat
       → Optionally save as friend → reconnect later
```

It's anonymous in the user-facing sense (no real names exposed) but accounts are persistent — your friends list and human chat history survive across sessions. AI fallback chats are ephemeral in Redis, while safe distilled chat-personalization signals can be stored in Postgres for 90 days if personalization is enabled.

## 2. Live URLs + accounts

| What        | URL                                                  |
| ----------- | ---------------------------------------------------- |
| **Web app** | <https://vently-web-gamma.vercel.app>                |
| **API**     | <https://api-production-7fe02.up.railway.app>        |
| **Health**  | <https://api-production-7fe02.up.railway.app/health> |
| **GitHub**  | <https://github.com/praveen202105/Vently>            |

Current production note:

- **API deploy verified:** Railway production deployment `bc3d44a0-8df5-40bf-87ff-ad1d0f92d8d2` is running commit `f09fa98`.
- **Prod smoke verified:** health OK, Gemini embeddings active, AI fallback `LATE_NIGHT` Playwright smoke passed, and recent Railway logs had no warnings/errors.

Provider dashboards:

- **Railway** (api + postgres + redis): <https://railway.com/project/5089630a-4313-46f8-bab8-7051c52b42f1>
- **Vercel** (web): <https://vercel.com/coderpraveengupta-7886s-projects/vently-web>

---

## 3. Tech stack

### Frontend ([apps/web](apps/web))

| Tool                                | Why                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 15** (App Router)         | React framework with SSR, server components, edge middleware. Each top-level folder under `app/` is a route.                |
| **React 19**                        | UI library. Client components are marked with `'use client'`; everything else is a Server Component by default.             |
| **TypeScript**                      | Strict mode. All shared types live in `packages/shared`.                                                                    |
| **Tailwind v4**                     | Utility-first CSS. Theme tokens (colors, radii) live in [globals.css](apps/web/src/styles/globals.css) via `@theme inline`. |
| **shadcn/ui**                       | Re-export of Radix primitives + custom theming. Currently lighter usage — most components are hand-rolled.                  |
| **Framer Motion** (`motion/react`)  | Animation library used for the splash/welcome/matching screens.                                                             |
| **Zustand**                         | State management. One store per concern: `authStore`, `matchStore`, `chatStore`, `callStore`.                               |
| **TanStack Query (v5)**             | Server-state cache for REST data (conversations, notifications, friends).                                                   |
| **socket.io-client**                | Real-time bidirectional events. Auth via JWT in handshake.                                                                  |
| **react-hook-form + Zod**           | Form state + validation. Schemas live in `packages/shared/schemas`.                                                         |
| **sonner**                          | Toast notifications.                                                                                                        |
| **lucide-react**                    | Icon set.                                                                                                                   |
| **Browser MediaRecorder/Web Audio** | Voice notes in chat + synthetic call/ringback tones.                                                                        |
| **Playwright**                      | End-to-end browser testing, including prod smoke tests.                                                                     |

### Backend ([apps/api](apps/api))

| Tool                                    | Why                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NestJS 10**                           | Opinionated Node framework with DI, decorators, modules.                                                                                             |
| **TypeScript**                          | Strict mode.                                                                                                                                         |
| **Prisma**                              | Type-safe ORM + migrations. Schema is the single source of truth — see [packages/shared/prisma/schema.prisma](packages/shared/prisma/schema.prisma). |
| **PostgreSQL**                          | Persistent data. All user, profile, message, friendship, etc.                                                                                        |
| **Redis**                               | Matchmaking queues (sorted sets + Lua script), Socket.io adapter for horizontal scale, eventually cache + rate-limit storage.                        |
| **Socket.io 4**                         | Realtime layer. Each feature module has its own Gateway (`@WebSocketGateway`).                                                                       |
| **Passport + JWT**                      | Auth strategy. Access token in `Authorization: Bearer` header. Rotating refresh token in httpOnly cookie.                                            |
| **bcryptjs**                            | Password hashing (cost 12).                                                                                                                          |
| **class-validator + class-transformer** | Request DTO validation.                                                                                                                              |
| **nestjs-pino**                         | Structured JSON logs.                                                                                                                                |
| **@nestjs/throttler**                   | Rate limiting.                                                                                                                                       |
| **WebRTC** (browser native)             | P2P 1:1 voice. Signaling over Socket.io. ICE servers from Open Relay (free) or Cloudflare/Metered.                                                   |
| **Groq SDK**                            | Llama 3.1 8B for AI fallback replies, AI ice-breakers, smart reply chips, and translation fallback.                                                  |
| **Gemini embeddings REST API**          | `gemini-embedding-001` for semantic RAG retrieval. Falls back to `local-semantic-hash-v1` when `GEMINI_API_KEY` is absent.                           |
| **web-push**                            | VAPID-based browser push notifications.                                                                                                              |

### Infra

- **Vercel** — Next.js web hosting (free Hobby tier).
- **Railway** — API + Postgres + Redis. Docker-based deploy from the repo's [apps/api/Dockerfile](apps/api/Dockerfile).
- **Turborepo + pnpm** workspaces — monorepo orchestration.
- **Groq** — LLM provider for live chat intelligence. Controlled by `GROQ_API_KEY`.
- **Google AI Studio / Gemini** — embedding provider. Controlled by `GEMINI_API_KEY` + `GEMINI_EMBEDDING_MODEL`.

---

## 4. Repo layout

```
vently/
├── apps/
│   ├── web/                   Next.js 15 frontend → Vercel
│   │   ├── app/               App-Router routes (file = route)
│   │   │   ├── (marketing)/     Public: /, /welcome, /home
│   │   │   ├── (auth)/          /login, /register, /forgot-password
│   │   │   ├── (app)/           Authed: /onboarding, /mood, /matching,
│   │   │   │                   /chat/[id], /call/[id], /connections, /profile
│   │   │   ├── layout.tsx       Root layout (fonts, providers, AuthBootstrap)
│   │   │   ├── error.tsx        Global error boundary
│   │   │   └── not-found.tsx    404
│   │   ├── middleware.ts      Edge middleware (no-op for now; placeholder)
│   │   ├── src/
│   │   │   ├── components/      Reusable React components
│   │   │   │   ├── auth/        AuthBootstrap (hydrates /me on mount)
│   │   │   │   ├── forms/       LoginForm, RegisterForm, OnboardingForm
│   │   │   │   ├── screens/     Full-screen components (splash, welcome, chat, …)
│   │   │   │   ├── chat/        Message bubbles, composer, etc. (inlined in chat-screen)
│   │   │   │   ├── call/        IncomingCallRinger
│   │   │   │   ├── friends/     (inlined in connections-screen)
│   │   │   │   ├── safety/      ReportDialog
│   │   │   │   ├── shell/       DesktopSidebar, MobileNavigation, ResponsiveShell
│   │   │   │   ├── notifications/ NotificationBell + drawer
│   │   │   │   └── marketing/   AuthAwareCta
│   │   │   ├── lib/
│   │   │   │   ├── api/         REST client + per-resource modules
│   │   │   │   ├── socket/      Socket.io singleton + hooks
│   │   │   │   ├── webrtc/      useWebRTC + ringtone + ICE servers
│   │   │   │   └── auth/        useAuthBootstrap (silent refresh)
│   │   │   ├── stores/          Zustand stores (auth, match, chat, call)
│   │   │   ├── providers/       React Query, etc.
│   │   │   ├── hooks/           Misc hooks
│   │   │   └── styles/          globals.css (Tailwind + theme tokens)
│   │   ├── tests/e2e/         Playwright end-to-end suite
│   │   └── playwright.config.ts
│   │
│   └── api/                   NestJS API → Railway (Docker)
│       ├── src/
│       │   ├── main.ts          Bootstrap (Helmet, CORS, ValidationPipe, RedisIoAdapter)
│       │   ├── app.module.ts    Imports every feature module
│       │   ├── common/          Cross-cutting: filters, decorators, pipes
│       │   ├── prisma/          PrismaService (DI wrapper)
│       │   ├── redis/           RedisModule with REDIS_CLIENT / PUB / SUB
│       │   ├── health/          GET /health
│       │   ├── auth/            Register / login / refresh / logout + JWT strategy
│       │   ├── users/           GET /me
│       │   ├── profiles/        PUT/PATCH /me/profile (onboarding + edit)
│       │   ├── conversations/   GET /conversations, DELETE (leave)
│       │   ├── messages/        GET /conversations/:id/messages (cursor paginated)
│       │   ├── chat/            ChatGateway — chat:send/typing/read socket handlers
│       │   ├── presence/        PresenceService (sets Profile.isOnline)
│       │   ├── matchmaking/     MatchmakingService (Redis sorted set + Lua) + Gateway
│       │   ├── realtime/        RealtimeGateway (root: JWT-auth, connect/disconnect lifecycle)
│       │   ├── friends/         FriendRequest CRUD + Friendship creation
│       │   ├── blocks/          Block CRUD (enforced in chat/match/calls)
│       │   ├── calls/           CallsGateway (WebRTC signaling) + CallSession persistence
│       │   ├── webrtc/          GET /webrtc/ice-servers (mints TURN creds or returns Open Relay)
│       │   ├── moderation/      Profanity filter
│       │   ├── reports/         POST /reports
│       │   ├── notifications/   GET/PATCH /notifications + socket emit on push
│       │   ├── push/            Browser push subscription + VAPID sends
│       │   ├── icebreaker/      Groq streaming opener after human matches
│       │   ├── suggestions/     Groq smart reply chips
│       │   ├── translation/     Groq translation + localized reply chips
│       │   ├── ai-peer/         AI fallback personas + Groq runner
│       │   ├── ai-memory/       Chat personalization RAG retrieval/observation
│       │   └── slack/           Dev/ops Slack trigger endpoints
│       ├── Dockerfile         Multi-stage build for Railway
│       └── railway.toml       Service config (lives at repo root actually — see §13)
│
├── packages/
│   ├── shared/                Cross-app contracts
│   │   ├── prisma/schema.prisma   Single source of truth for the DB
│   │   ├── prisma/migrations/     Generated SQL migrations (committed)
│   │   └── src/
│   │       ├── socket-events.ts   Constant names + typed payload interfaces +
│   │       │                       ClientToServerEvents / ServerToClientEvents maps
│   │       ├── types/             Domain types (UserPublic, ProfilePublic, …)
│   │       └── schemas/           Zod schemas (auth, profile, report)
│   │
│   ├── ui/                    Shared React components
│   │   └── src/components/        Button, GlassCard, AnimatedBackground
│   │
│   └── config/                Shared tooling
│       ├── tsconfig.base.json
│       ├── tsconfig.next.json     Web extends this
│       ├── tsconfig.nest.json     API extends this
│       ├── tsconfig.lib.json      Packages extend this
│       └── eslint.config.js
│
├── .github/workflows/         CI (typecheck, lint, build, prisma validate)
├── docker-compose.yml         Local Postgres + Redis
├── railway.toml               Builds api from apps/api/Dockerfile
├── package.json               Root scripts (turbo wrappers)
├── pnpm-workspace.yaml        Workspace declaration
├── turbo.json                 Pipeline config
├── VENTLY_PLAN.md             Architecture + phased roadmap (the original plan)
├── DEPLOY.md                  Production deploy walkthrough
├── docs/                      Feature docs + verification pipeline notes
├── futureplan.md              Backlog / future implementation notes
├── bugs.md                    Current bug notes when used
└── KT.md                      You are here.
```

---

## 5. Run it locally

### Prerequisites

- macOS or Linux
- Node.js 20+ (`brew install node@20` or via nvm)
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Postgres 16 — either Docker or `brew install postgresql@16`
- Redis 7+ — either Docker or `brew install redis`

### First-time setup

```bash
git clone https://github.com/praveen202105/Vently.git
cd Vently
pnpm install
```

Start Postgres + Redis:

```bash
# Option A — Docker (recommended if you have it):
docker compose up -d

# Option B — Homebrew (no Docker):
brew services start postgresql@16
brew services start redis

# Create the dev database (one-time):
createuser vently --createdb     # macOS
createdb vently -O vently        # macOS
# Or via psql:
psql postgres -c "CREATE USER vently WITH PASSWORD 'vently_dev' CREATEDB;"
psql postgres -c "CREATE DATABASE vently OWNER vently;"
```

Env files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The default values point at `localhost:5432` Postgres and `localhost:6379` Redis. If you ran Postgres on a different port (e.g. `:5433` because system Postgres holds `:5432`), edit `apps/api/.env`:

```
DATABASE_URL=postgresql://vently:vently_dev@localhost:5433/vently?schema=public
```

Apply migrations + generate Prisma client:

```bash
pnpm --filter @vently/shared exec prisma migrate dev
```

Start everything:

```bash
pnpm dev    # web on :3000, api on :4000
```

You should be able to:

- Open <http://localhost:3000> — splash → welcome
- `curl http://localhost:4000/health` → `{ status: "ok", … }`

### Common scripts

```bash
pnpm dev              # web + api in watch mode
pnpm build            # production build everything
pnpm typecheck        # tsc across workspace
pnpm lint             # ESLint across workspace
pnpm db:migrate       # apply Prisma migrations
pnpm db:studio        # open Prisma Studio (GUI for the DB)
pnpm --filter @vently/web test:e2e   # run Playwright suite
```

---

## 6. Feature walkthroughs

For each feature: **what the user sees**, **where the code lives**, and **how it works under the hood**. Read these in order — they build on each other.

### 6.1 Auth (register / login / refresh)

#### What the user sees

- `/register` — email + password form. Submit → land on `/onboarding`.
- `/login` — email + password form. Submit → land on `/mood`.
- After login, session persists for 30 days even after closing the tab.

#### Files

- Backend: [apps/api/src/auth/](apps/api/src/auth/) — [auth.controller.ts](apps/api/src/auth/auth.controller.ts), [auth.service.ts](apps/api/src/auth/auth.service.ts), [jwt.strategy.ts](apps/api/src/auth/strategies/jwt.strategy.ts), [session.repository.ts](apps/api/src/auth/repositories/session.repository.ts)
- Frontend: [components/forms/login-form.tsx](apps/web/src/components/forms/login-form.tsx), [register-form.tsx](apps/web/src/components/forms/register-form.tsx), [lib/api/auth.ts](apps/web/src/lib/api/auth.ts), [lib/auth/refresh.ts](apps/web/src/lib/auth/refresh.ts), [stores/auth-store.ts](apps/web/src/stores/auth-store.ts), [lib/api/client.ts](apps/web/src/lib/api/client.ts)

#### Under the hood

**Tokens**:

- **Access token** = JWT, signed with `JWT_ACCESS_SECRET`, **15 min** TTL. Sent in `Authorization: Bearer …` header. Kept in memory (Zustand) — never localStorage (XSS safety).
- **Refresh token** = random 64-byte string. Hashed (`sha256`) and stored in `Session` row. Sent to the client as an **httpOnly Secure SameSite=None** cookie (`vently_refresh`). 30-day TTL.

**Flow:**

```
POST /auth/register {email, password}
  → bcrypt.hash → INSERT User → issueTokens
  → Set-Cookie: vently_refresh=<random>; HttpOnly; Secure; SameSite=None
  → Body: { accessToken, expiresIn, user }

POST /auth/login {email, password}
  → bcrypt.compare → issueTokens → same response shape

POST /auth/refresh  (cookie auto-sent by browser)
  → look up Session by hash(cookie)
  → if found & not expired: DELETE old Session, INSERT new Session, issue new pair
  → if not found / expired: 401

POST /auth/logout
  → DELETE Session by hash(cookie) + clear cookie
```

**Frontend "silent refresh"**: `lib/auth/refresh.ts` (used in [AuthBootstrap](apps/web/src/components/auth/auth-bootstrap.tsx)) runs on mount of every page (it's in the root layout). It calls `GET /me`. If that returns 401, the api client wrapper ([client.ts](apps/web/src/lib/api/client.ts)) catches it, calls `POST /auth/refresh`, then retries `/me` once. If both fail, the user is treated as anonymous.

A periodic timer also refreshes 30 s before the 15 min JWT expiry, so a long-open tab never sees a 401.

**Why two tokens?** Access tokens are short-lived so a stolen one expires fast. Refresh tokens are bigger and longer-lived but only travel in httpOnly cookies (inaccessible to JS) so XSS can't steal them.

### 6.2 Onboarding + profile

#### What the user sees

- After register → `/onboarding` form: nickname (3-20 chars), gender (Male/Female), optional bio (≤280), and an 18+ checkbox.
- Submit → `/mood`.
- Later you can edit nickname from `/profile` (inline edit pencil).

#### Files

- Backend: [profiles.controller.ts](apps/api/src/profiles/profiles.controller.ts), [profiles.service.ts](apps/api/src/profiles/profiles.service.ts), [upsert-profile.dto.ts](apps/api/src/profiles/dto/upsert-profile.dto.ts)
- Frontend: [components/forms/onboarding-form.tsx](apps/web/src/components/forms/onboarding-form.tsx), [components/screens/profile-screen.tsx](apps/web/src/components/screens/profile-screen.tsx)

#### Under the hood

The api has two endpoints:

- `PUT /me/profile` — full upsert. Used by onboarding. Requires `ageConfirmed: true` (we re-validate on server, not just client-side, so an old/hacked client can't bypass the gate).
- `PATCH /me/profile` — partial update. Used by the profile screen (just nickname).

Avatar: there are **no image uploads**. The avatar is a deterministic gradient circle with the first letter of the nickname. `avatarSeed` is `sha1(nickname.toLowerCase()).slice(0, 16)` — used to seed gradient colors on the client. Cheap, anonymous, no S3 needed.

The OnboardingForm uses [react-hook-form](https://react-hook-form.com/) + the Zod schema [`onboardingSchema`](packages/shared/src/schemas/profile.ts). The same schema is _also_ enforced on the backend via class-validator + matching constraints — defense in depth.

### 6.3 Matchmaking

#### What the user sees

1. `/mood` — pick one of 7 moods (Lonely, Need to talk, Friendship, Late night, Advice, Flirty, Voice only).
2. `/matching` — spinner + "Looking for someone…" status.
3. Within seconds (if another user of opposite gender is on the same mood): "Match found!" → redirect to `/chat/[conversationId]`.
4. If 60 s pass with no match: "No one's around right now" + "Pick another mood" button.

#### Files

- Backend: [matchmaking.service.ts](apps/api/src/matchmaking/matchmaking.service.ts), [matchmaking.gateway.ts](apps/api/src/matchmaking/matchmaking.gateway.ts)
- Frontend: [mood-selection-screen.tsx](apps/web/src/components/screens/mood-selection-screen.tsx), [matching-screen.tsx](apps/web/src/components/screens/matching-screen.tsx), [stores/match-store.ts](apps/web/src/stores/match-store.ts)

#### Under the hood

We store tickets in **Redis sorted sets** keyed `queue:<MOOD>:<GENDER>`. Score = `Date.now()` so the oldest waiting user matches first (FIFO).

The actual match logic is a **Lua script** so it runs atomically — without it, two clients hitting `match:join` at the same instant could both think they're waiting and never pair up.

```lua
-- Pseudo-code; see matchmaking.service.ts MATCH_SCRIPT
local peers = redis.call('ZRANGE', oppositeQueue, 0, 0)
if #peers > 0 and peers[1] ~= myUserId then
  redis.call('ZREM', oppositeQueue, peers[1])
  return peers[1]                              -- matched
end
redis.call('ZADD', myQueue, now, myUserId)
return nil                                     -- queued
```

After a match:

1. Backend creates a `Conversation` row (`type=DIRECT`) + two `ConversationParticipant` rows.
2. Emits `match:found` to both users' rooms with `{ conversationId, peer }`.
3. Both sockets are joined to the `conv:<id>` room (already done server-side as part of the gateway flow).

Block enforcement: after popping a peer from Lua, the service checks the `Block` table. If blocked, it retries up to 3 times so a blocked pair never gets matched.

**AI fallback:** if `AI_FALLBACK_ENABLED=true`, a queued text mood schedules a timer (`AI_FALLBACK_MS`, currently 8s in the env example). If no human match lands before the timer fires, the gateway removes the user from the queue and spawns an ephemeral AI peer from [apps/api/src/ai-peer/personas.json](apps/api/src/ai-peer/personas.json). `VOICE_ONLY` never uses AI fallback.

### 6.4 Realtime chat

#### What the user sees

- **Realtime Text Exchange**: `/chat/[conversationId]` opens automatically on match. Sending messages is instantaneous.
- **Dynamic Viewport Height (`dvh`)**: Root chat container scales automatically to perfectly fit mobile screens and dynamic keyboards without cutoffs or hidden composers.
- **Bouncing Inline Typing Bubble**: A fluid inline bubble with three bouncing dots animates at the bottom of the chat list while the peer is actively typing, providing a gorgeous, native messaging feedback loop (replaces static header text).
- **Haptic touch-long-press menus**: On touch-screen mobile devices, pressing a bubble for 500ms triggers a haptic vibration (`navigator.vibrate(15)`) and pops up the custom **Reply / Delete** context action overlay.
- **Smart Scroll protection & "New Message 👇" badge**: Scroll-proximity limits prevent the view from violently auto-scrolling when a peer message arrives while you are reading historical messages. A glassmorphic button floats above the composer instead to let you jump back down, disappearing automatically when you scroll near the bottom.
- **Reactive connection banner**: If the websocket loses connection, a top glassmorphic banner slides in indicating _"Connection lost. Reconnecting..."_ with a pulsing yellow warning indicator, sliding out automatically when connection is restored.
- **Header Actions**: Clean online/offline peer state text, save-as-friend, voice-calling, blocking, and reporting triggers.

#### Files

- Backend: [chat.gateway.ts](apps/api/src/chat/chat.gateway.ts), [messages.service.ts](apps/api/src/messages/messages.service.ts), [conversations.service.ts](apps/api/src/conversations/conversations.service.ts)
- Frontend: [chat-screen.tsx](apps/web/src/components/screens/chat-screen.tsx), [lib/socket/socket.ts](apps/web/src/lib/socket/socket.ts), [lib/socket/use-socket-event.ts](apps/web/src/lib/socket/use-socket-event.ts)

#### Under the hood

All chat traffic flows over **Socket.io** (not REST), except the initial history load.

**On chat-screen mount:**

1. `GET /api/conversations/:id/messages?limit=30` to fetch the last page of messages (cursor-paginated, descending).
2. Subscribe to socket events: `chat:message`, `chat:ack`, `chat:typing-status`, `chat:read-status`.
3. Emit `chat:join { conversationId }` so the server adds this socket to the `conv:<id>` room (needed after a reconnect, since matchmaking only auto-joins once on initial match).

**Send a message:**

- Client generates a `clientId` (random) and emits `chat:send { conversationId, body, clientId }`.
- The same `clientId` lets us instantly add the message to the UI as `{pending: true}` (optimistic update).
- Server profanity-checks the body, persists a `Message` row, then emits:
  - `chat:ack { clientId, messageId }` back to sender → swap optimistic message with real one.
  - `chat:message { …fullMessage }` to the rest of the room → peer renders it.

**Typing & Bouncing Indicators:**

- Typing emits a debounced 300ms `chat:typing { isTyping: true }` event. Auto-stops 3s after last keystroke.
- The inline typing bubble is rendered at the bottom of the list when `peerTyping` is true, and is wrapped inside `<AnimatePresence>` for beautiful exit fade transitions when typing stops.

**Touch Handlers (Mobile Long-press):**

- Coordinates tracked via `onTouchStart` and `onTouchMove` to ignore swipe movements. If touch persists for `500ms`, `navigator.vibrate(15)` fires, showing the contextual option card (Reply / Delete).

**Scroll Management & Badge:**

- Proximity checks compute `scrollHeight - scrollTop - clientHeight < 150`. If the user is scrolled up, incoming messages toggle `showNewMessageBadge` to true. Clicking the badge triggers smooth scrolling to bottom and clears the state. An `onScroll` handler on the container also clears the badge if the user manually scrolls back down.

**Network Connectivity States:**

- The socket instance hooks standard client events (`connect`, `disconnect`) to mirror connectivity state into a reactive local state hook, triggering a sliding header alert.

**Read receipts:** when a message scrolls into view (IntersectionObserver), client emits `chat:read { conversationId, lastMessageId }`. Server upserts `MessageReceipt.readAt` for every prior message + emits `chat:read-status` to peer.

### 6.5 Voice calling (WebRTC)

#### What the user sees

1. In a chat, click the Phone icon in the header → call screen opens, "Calling…" ringback tone plays.
2. The user sees a modern, dynamic avatar surrounded by **glowing, concentric pulsing rings** using Framer Motion (`motion.div` keyframes) to represent connecting and dialer states.
3. The other side gets a top-right banner with the ringtone + Accept/Reject buttons.
4. Accept → both phones connect → "00:00 …" timer starts → audio flows P2P.
5. Either side hits the red phone button to hang up. Duration is saved as a `CallSession` row.

#### Files

- Backend: [calls.gateway.ts](apps/api/src/calls/calls.gateway.ts), [calls.service.ts](apps/api/src/calls/calls.service.ts), [webrtc/ice.service.ts](apps/api/src/webrtc/ice.service.ts)
- Frontend: [voice-call-screen.tsx](apps/web/src/components/screens/voice-call-screen.tsx), [lib/webrtc/use-webrtc.ts](apps/web/src/lib/webrtc/use-webrtc.ts), [lib/webrtc/use-ringtone.ts](apps/web/src/lib/webrtc/use-ringtone.ts), [components/call/incoming-call-ringer.tsx](apps/web/src/components/call/incoming-call-ringer.tsx)

#### Under the hood

WebRTC is **peer-to-peer**. The backend is only a **signaling relay** — it never sees the audio data. The actual audio stream flows between the two browsers directly (or via a TURN relay if NATs are restrictive).

**The 7-step handshake (this is the part that's most often misimplemented):**

```
Caller                                           Callee
  │                                                │
  │── 1. emit call:invite ─────────────────────→  │  (IncomingCallRinger shows)
  │                                                │
  │   (waits — DIALING, plays ringback tone)       │  (clicks Accept on ringer)
  │                                                │  → /call/[id]?incoming=1
  │                                                │  (clicks Accept on call screen)
  │                                                │
  │←── 2. emit call:accept ──────────────────────│  acceptCall(): mic + RTCPeerConnection
  │                                                │
  │   onAccept: createOffer + setLocalDescription  │  (waiting for offer)
  │── 3. emit call:offer (SDP) ──────────────────→│
  │                                                │  setRemoteDescription
  │                                                │  createAnswer + setLocalDescription
  │←── 4. emit call:answer (SDP) ─────────────────│
  │   setRemoteDescription                         │
  │                                                │
  │←─ 5. ICE candidates exchange (both ways) ─→  │
  │                                                │
  │      connectionstatechange = 'connected'       │
  │              → CONNECTED — audio flows P2P     │
```

**Why the order matters:** earlier versions of this code emitted the offer immediately after the invite. The callee was still on the ringer (not on `/call`), so their PeerConnection didn't exist yet — the offer event was broadcast and silently dropped. The call hung in "Connecting…" forever. The fix is what's shown above: the caller waits for the callee's `call:accept` before sending the SDP offer — that guarantees both PeerConnections exist when SDP exchange starts.

**ICE candidates** start firing on each side once `setLocalDescription` is called and continue for a few seconds. Each side buffers candidates that arrive before its own `remoteDescription` is set, then drains the buffer right after.

**ICE servers**: the client calls `GET /webrtc/ice-servers` (auth-guarded). Server returns:

- Public **STUN** (Google's stun.l.google.com) — for finding your own public IP.
- **TURN** — either real credentials from Cloudflare Calls / Metered if `TURN_PROVIDER` is set, or the free **Open Relay Project** servers as a no-config fallback. TURN is needed when both peers are behind strict NATs (mobile networks, corporate firewalls).

**Ringtones** are synthesized with the **Web Audio API** — no MP3 files bundled. See [use-ringtone.ts](apps/web/src/lib/webrtc/use-ringtone.ts).

### 6.6 Friends + blocks

#### What the user sees

- During a chat, click the UserPlus icon → "Friend request sent" toast.
- Peer's `/connections` page shows a pending request → Accept → both see "You're now friends!" system message in the chat.
- Friends list shows online indicator + last-message preview. Tap → resume the original conversation.
- Block: Shield icon in chat header → confirms → user can't be matched with you again, can't send you messages.

#### Files

- Backend: [friends.controller.ts](apps/api/src/friends/friends.controller.ts), [friends.service.ts](apps/api/src/friends/friends.service.ts), [blocks.service.ts](apps/api/src/blocks/blocks.service.ts)
- Frontend: [connections-screen.tsx](apps/web/src/components/screens/connections-screen.tsx), [lib/api/friends.ts](apps/web/src/lib/api/friends.ts), [lib/api/blocks.ts](apps/web/src/lib/api/blocks.ts)

#### Under the hood

**Friendship is a canonical pair**: rows are always stored with `userAId < userBId` (sorted). Lookups don't have to consider direction.

**Send a request:**

```
POST /friends/requests { toUserId }
  → creates FriendRequest(status=PENDING)
  → if a reverse request already exists → auto-accept
  → emits friend:request to recipient
  → also writes a Notification row + emits notification:new
```

**Accept:**

```
PATCH /friends/requests/:id { accept: true }
  → updates status=ACCEPTED + INSERT Friendship
  → promotes the active Conversation to type=FRIEND
  → INSERT Message(type=SYSTEM, body="You're now friends!")
  → emits chat:message to both → both clients see it live
  → emits friend:respond to original sender
```

**Block** (table = `(blockerId, blockedId)`):

- Enforced in `chat:send` (refuses if either side blocked the other)
- Enforced in matchmaking (Lua-popped peer is skipped if blocked, up to 3 retries)
- Enforced in `call:invite` (rejects)
- Side effects: tears down the Friendship if any, ends shared active Conversation

### 6.7 Notifications

#### What the user sees

- Bell icon in the desktop sidebar with an unread badge.
- Click → drawer opens with the list: "New friend request", "Friend request accepted", etc.
- Click an item → marks as read.
- Browser push can notify for messages/friend events when the tab is backgrounded or closed, if the user grants permission.

#### Files

- Backend: [notifications.service.ts](apps/api/src/notifications/notifications.service.ts), [notifications.controller.ts](apps/api/src/notifications/notifications.controller.ts)
- Frontend: [notification-bell.tsx](apps/web/src/components/notifications/notification-bell.tsx), [lib/api/notifications.ts](apps/web/src/lib/api/notifications.ts)

#### Under the hood

`NotificationsService.push(userId, type, payload)` does two things:

1. INSERT a `Notification` row.
2. Emit `notification:new` over the socket to that user's room.

On the client, the bell uses TanStack Query for the initial list + listens for `notification:new` to inject newly-pushed items into the cache. Unread count = `n.readAt === null`.

Browser push is handled separately by `PushService`: the web app stores PushManager subscriptions via `/api/push/subscribe`, and chat sends OS notifications only when `FocusService` says the recipient is not actively reading that conversation.

Triggers wired so far: friend request, friend accepted, and message-while-away push. (Backlog: richer missed-call notification UX.)

### 6.8 Safety: report + profanity

#### Files

- Backend: [reports.controller.ts](apps/api/src/reports/reports.controller.ts), [moderation/profanity.filter.ts](apps/api/src/moderation/profanity.filter.ts), [moderation.service.ts](apps/api/src/moderation/moderation.service.ts)
- Frontend: [components/safety/report-dialog.tsx](apps/web/src/components/safety/report-dialog.tsx)

#### Under the hood

**Profanity** is a two-tier word-boundary regex check that runs in `chat:send` before the message is persisted:

- `SEVERE` → reject the send (returns `{ok: false}` to the client), write a `ModerationFlag` row tagged `BLOCKED`.
- `MILD` → message goes through, `ModerationFlag` row is written tagged `allowed` so we have a paper trail.
- `CLEAN` → no-op.

**Reports** (`POST /api/reports`) just inserts a `Report` row with reason + free-text details (≤ 2000 chars). The admin moderation dashboard is post-V1 — for now you can review reports via `pnpm db:studio`.

### 6.9 AI fallback + chat personalization RAG

#### What the user sees

- If no human match arrives quickly, the user still lands in a normal-looking `/chat/ai_conv_...` conversation.
- The UI does **not** show "AI", "RAG", or "AI memory" wording in chat.
- Voice call and friend actions are quietly unavailable for AI fallback peers; report/block remain available.
- Profile shows **Chat personalization** controls: enabled/paused state and a clear action.
- AI replies are short, WhatsApp-like, and adapt to language/tone: Hinglish, serious, playful, flirty, supportive, etc.

#### Files

- AI fallback peer registry: [apps/api/src/ai-peer/ai-peer.service.ts](apps/api/src/ai-peer/ai-peer.service.ts)
- AI reply runner/prompt: [apps/api/src/ai-peer/ai-agent.runner.ts](apps/api/src/ai-peer/ai-agent.runner.ts)
- Static persona pool: [apps/api/src/ai-peer/personas.json](apps/api/src/ai-peer/personas.json)
- Mood RAG seed source: [apps/api/src/ai-peer/tone-packs.json](apps/api/src/ai-peer/tone-packs.json)
- Persona/story RAG seed source: [apps/api/src/ai-peer/persona-stories.json](apps/api/src/ai-peer/persona-stories.json)
- Memory/RAG service: [apps/api/src/ai-memory/ai-memory.service.ts](apps/api/src/ai-memory/ai-memory.service.ts)
- Memory controls API: [apps/api/src/ai-memory/ai-memory.controller.ts](apps/api/src/ai-memory/ai-memory.controller.ts)
- Embeddings: [apps/api/src/profiles/embedding.service.ts](apps/api/src/profiles/embedding.service.ts)
- Web profile controls: [apps/web/src/components/screens/profile-screen.tsx](apps/web/src/components/screens/profile-screen.tsx)

#### Under the hood

AI fallback is intentionally **ephemeral**:

- `AIPeerService.spawn()` mints `ai_<persona>_<rand>` and `ai_conv_<rand>_<time>` ids.
- Redis stores `aichat:conv:<conversationId>` and `aichat:user:<userId>` for 60 minutes.
- A 10-minute `aichat:rl:<userId>` throttle prevents repeated AI sessions from burning quota.
- No `Conversation` or `Message` rows are written for AI fallback chats. Chat history is only a capped Redis list for prompt context.

Persona pool:

- Total AI personas: **20**.
- AI girls: **10** total.
- `LATE_NIGHT` AI girl candidates: **6** (`kavya`, `riya`, `ananya`, `sara`, `priya`, `isha`).
- Persona selection matches requested mood + target gender, then picks randomly from candidates.

RAG design:

- `AiRagChunk.scope=MOOD_TEMPLATE` stores seeded mood examples from `tone-packs.json`.
- `AiRagChunk.scope=PERSONA_TEMPLATE` stores seeded persona/story context from `persona-stories.json`.
- `AiRagChunk.scope=USER_MEMORY` stores only distilled personalization signals, never raw full chat logs.
- User memory expires after **90 days**.
- Missing `AiMemoryPreference` means personalization is enabled by default; `DELETE /me/ai-memory` clears chunks and disables it.
- Normal human chats can feed personalization, but only from the sender's own clean text messages. Peer messages are never stored into another user's memory.
- AI fallback chats can also feed personalization via the user's own AI-chat turns.

Embedding/retrieval:

- Production uses Gemini `gemini-embedding-001` when `GEMINI_API_KEY` is present.
- If Gemini is unavailable, the app falls back to `local-semantic-hash-v1`, so chat still works.
- Embeddings are stored as Postgres JSON arrays; v1 ranks candidates in app code using cosine similarity.
- If embedding dimensions mismatch or generation fails, retrieval falls back to lexical text similarity.

Prompt behavior:

- `AIAgentRunner` retrieves mood + persona + user context before the Groq reply.
- Retrieved notes are injected as hidden soft context only. The AI must not say "I remember" or reveal memory/RAG/personalization.
- `LATE_NIGHT` remains cozy/flirty but non-graphic. Explicit sexual requests get a short playful slow-down, not graphic content and not a policy lecture.
- `AI_CHAT_TIME_ZONE` defaults to `Asia/Kolkata`. The prompt includes local time context so daytime chats do not incorrectly say "raat", "1am", or "neend nahi aa rahi" unless the user brought up night/sleep.

User controls:

| Method | Path            | Purpose                                                                |
| ------ | --------------- | ---------------------------------------------------------------------- |
| GET    | `/me/ai-memory` | Returns `{ enabled, chunkCount, lastUpdatedAt, retentionDays }`        |
| PATCH  | `/me/ai-memory` | Accepts `{ enabled: boolean }`                                         |
| DELETE | `/me/ai-memory` | Deletes current user's memory chunks and sets personalization disabled |

### 6.10 Chat intelligence + polish

These are layered on top of the base chat feature in §6.4.

#### What the user sees

- AI ice-breaker bubble streams after a human match to help start the chat.
- Smart reply chips appear after ice-breakers and incoming messages.
- Message search runs inside a conversation.
- Quote reply, delete-for-everyone, emoji reactions, read receipts, and translate controls are available from message UI.
- Voice notes can be recorded from the composer and rendered inline.
- Browser push notifications can wake the user when a message arrives while they are away.

#### Files

- Ice-breakers: [apps/api/src/icebreaker/](apps/api/src/icebreaker/), [apps/web/src/components/chat/icebreaker-bubble.tsx](apps/web/src/components/chat/icebreaker-bubble.tsx)
- Smart reply chips: [apps/api/src/suggestions/suggestions.service.ts](apps/api/src/suggestions/suggestions.service.ts), [apps/web/src/components/chat/suggestion-chips.tsx](apps/web/src/components/chat/suggestion-chips.tsx)
- Translation: [apps/api/src/translation/](apps/api/src/translation/), [apps/web/src/components/chat/translate-button.tsx](apps/web/src/components/chat/translate-button.tsx)
- Reactions: [apps/api/src/messages/reactions.controller.ts](apps/api/src/messages/reactions.controller.ts), [apps/web/src/components/chat/reaction-picker.tsx](apps/web/src/components/chat/reaction-picker.tsx), [reaction-pills.tsx](apps/web/src/components/chat/reaction-pills.tsx)
- Voice notes: [apps/web/src/components/chat/audio-bubble.tsx](apps/web/src/components/chat/audio-bubble.tsx), composer logic in [chat-screen.tsx](apps/web/src/components/screens/chat-screen.tsx)
- Push: [apps/api/src/push/](apps/api/src/push/), [apps/web/src/lib/push/use-push.ts](apps/web/src/lib/push/use-push.ts), [push-permission-prompt.tsx](apps/web/src/components/notifications/push-permission-prompt.tsx)

#### Under the hood

- Ice-breakers and suggestions use Groq `llama-3.1-8b-instant`; missing `GROQ_API_KEY` disables them gracefully.
- Translation endpoint returns detected language, translated text, and up to 3 localized reply chips.
- Message reactions are idempotent toggles on `(messageId, userId, emoji)`.
- Delete-for-everyone soft-deletes by setting `Message.deletedAt`; clients render "This message was deleted".
- Voice notes are sent as `audio:<base64 webm>` bodies. The message length cap is higher for audio payloads.
- Push sends only when the peer is not focused on the conversation (`presence:focus`), avoiding redundant OS notifications while the chat is open.

---

## 7. Data model (Prisma schema)

Source of truth: [packages/shared/prisma/schema.prisma](packages/shared/prisma/schema.prisma). Open Prisma Studio to inspect rows visually (`pnpm db:studio`).

```
User                  — id, email, passwordHash?, googleId?, role
  └─ Profile (1:1)    — nickname, gender, bio, mood, avatarSeed, isOnline, lastSeenAt
  └─ Session (1:n)    — refreshTokenHash, expiresAt, deviceInfo
  └─ PushSubscription — endpoint, p256dh, auth, userAgent
  └─ AiMemoryPreference — chat personalization enabled/disabled
  └─ AiRagChunk       — USER_MEMORY chunks for that user

Conversation          — id, type (DIRECT|FRIEND|AI_FALLBACK), createdAt, endedAt
  └─ ConversationParticipant (n:n with User via Conversation)
  └─ Message (1:n)    — senderId, body, type (TEXT|SYSTEM), deletedAt, replyToMessageId
       └─ MessageReceipt (per participant) — deliveredAt, readAt
       └─ MessageReaction (per user + emoji)
       └─ ModerationFlag (optional)
  └─ CallSession (1:n) — callerId, calleeId, startedAt, endedAt, durationSec, endReason

FriendRequest         — fromUserId, toUserId, status (PENDING|ACCEPTED|REJECTED|CANCELLED)
Friendship            — userAId, userBId  (canonical pair: userAId < userBId)
Block                 — blockerId, blockedId

Report                — reporterId, reportedId, conversationId?, reason, details, status
Notification          — userId, type, payload (JSON), readAt
ModerationFlag        — messageId?, reason, severity, action
AiRagChunk            — scope, mood?, kind, content, embedding Json?, metadata Json?, expiresAt
```

**Adding a new field?** Edit `schema.prisma` → `pnpm db:migrate` → Prisma generates a new migration SQL + regenerates the client. Commit both the schema and the generated migration folder.

---

## 8. REST API reference

Base path: `/api`. All endpoints return JSON. Auth is `Authorization: Bearer <accessToken>` unless marked **public**.

| Method | Path                                                           | Auth   | Purpose                                 |
| ------ | -------------------------------------------------------------- | ------ | --------------------------------------- |
| GET    | `/health`                                                      | public | DB + Redis healthcheck                  |
| POST   | `/auth/register`                                               | public | Create account                          |
| POST   | `/auth/login`                                                  | public | Sign in                                 |
| POST   | `/auth/refresh`                                                | cookie | Rotate tokens                           |
| POST   | `/auth/logout`                                                 | auth   | Revoke session                          |
| GET    | `/me`                                                          | auth   | Current user + profile                  |
| PUT    | `/me/profile`                                                  | auth   | Onboarding upsert                       |
| PATCH  | `/me/profile`                                                  | auth   | Partial update                          |
| GET    | `/me/ai-memory`                                                | auth   | Chat personalization status             |
| PATCH  | `/me/ai-memory`                                                | auth   | Enable/disable chat personalization     |
| DELETE | `/me/ai-memory`                                                | auth   | Clear personalization + disable         |
| GET    | `/conversations`                                               | auth   | List user's conversations               |
| GET    | `/conversations/unread-count`                                  | auth   | Total unread conversations/messages     |
| GET    | `/conversations/:id`                                           | auth   | Conversation metadata                   |
| DELETE | `/conversations/:id`                                           | auth   | Leave / end                             |
| GET    | `/conversations/:id/messages/search`                           | auth   | Search messages in conversation         |
| GET    | `/conversations/:id/messages`                                  | auth   | Paginated history (`?cursor=&limit=`)   |
| DELETE | `/conversations/:id/messages/:messageId`                       | auth   | Soft-delete own message                 |
| POST   | `/messages/:id/reactions`                                      | auth   | Toggle emoji reaction                   |
| GET    | `/friends`                                                     | auth   | List friendships                        |
| GET    | `/friends/requests`                                            | auth   | Incoming pending                        |
| POST   | `/friends/requests`                                            | auth   | Send request `{toUserId}`               |
| PATCH  | `/friends/requests/:id`                                        | auth   | `{accept: boolean}`                     |
| DELETE | `/friends/requests/:id`                                        | auth   | Cancel outgoing                         |
| DELETE | `/friends/:userId`                                             | auth   | Unfriend                                |
| GET    | `/blocks`                                                      | auth   | List blocked users                      |
| POST   | `/blocks`                                                      | auth   | Block `{userId}`                        |
| DELETE | `/blocks/:userId`                                              | auth   | Unblock                                 |
| GET    | `/notifications`                                               | auth   | List recent                             |
| PATCH  | `/notifications/:id/read`                                      | auth   | Mark one read                           |
| PATCH  | `/notifications/read-all`                                      | auth   | Mark all read                           |
| POST   | `/push/subscribe`                                              | auth   | Save browser push subscription          |
| DELETE | `/push/subscribe`                                              | auth   | Remove browser push subscription        |
| POST   | `/reports`                                                     | auth   | Submit `{reportedId, reason, details?}` |
| GET    | `/webrtc/ice-servers`                                          | auth   | STUN + TURN config                      |
| POST   | `/conversations/:conversationId/messages/:messageId/translate` | auth   | Translate one message + reply chips     |

Want to call them by hand? `curl -i -X GET https://api-production-7fe02.up.railway.app/api/me -H "Authorization: Bearer $ACCESS_TOKEN"`.

---

## 9. Socket event reference

Single namespace `/`. Auth: `socket = io(URL, { auth: { token } })`. Server validates JWT in the connection middleware.

Names are constants in [`packages/shared/src/socket-events.ts`](packages/shared/src/socket-events.ts) — typed via `ClientToServerEvents` / `ServerToClientEvents` maps.

| Event                   | Direction | Payload                                      | When                                       |
| ----------------------- | --------- | -------------------------------------------- | ------------------------------------------ |
| `presence:online`       | s→c       | `{ userId }`                                 | Any user comes online                      |
| `presence:offline`      | s→c       | `{ userId }`                                 | Any user goes offline                      |
| `match:join`            | c→s       | `{ mood, preferredGender? }`                 | User entered `/matching`                   |
| `match:cancel`          | c→s       | —                                            | User left `/matching`                      |
| `match:found`           | s→c       | `{ conversationId, peer }`                   | Both queued users paired                   |
| `match:queue-stats`     | s→c       | `{ mood, queueLength, estimatedWaitSec }`    | Queue ETA/stat updates                     |
| `match:timeout`         | s→c       | —                                            | (reserved — currently client-only timeout) |
| `presence:focus`        | c→s       | `{ conversationId: string or null }`         | Suppress push while user is reading chat   |
| `chat:join`             | c→s       | `{ conversationId }`                         | Re-join after reconnect                    |
| `chat:send`             | c→s       | `{ conversationId, body, clientId }`         | Sending a message                          |
| `chat:message`          | s→c       | full Message                                 | New message in your conversation           |
| `chat:ack`              | s→c       | `{ clientId, messageId }`                    | Server received + persisted your send      |
| `chat:typing`           | c→s       | `{ conversationId, isTyping }`               | Typing indicator                           |
| `chat:typing-status`    | s→c       | `{ userId, isTyping, conversationId }`       | Peer's typing status                       |
| `chat:read`             | c→s       | `{ conversationId, lastMessageId }`          | Mark up to here as read                    |
| `chat:read-status`      | s→c       | `{ userId, lastMessageId, conversationId }`  | Peer marked read                           |
| `chat:reaction`         | s→c       | `{ messageId, emoji, action, userId }`       | Reaction add/remove broadcast              |
| `chat:delete`           | c→s       | `{ conversationId, messageId }`              | Delete own message                         |
| `chat:delete-status`    | s→c       | `{ conversationId, messageId, deletedAt }`   | Message was soft-deleted                   |
| `chat:icebreaker:chunk` | s→c       | `{ conversationId, chunk }`                  | Streaming AI ice-breaker token             |
| `chat:icebreaker:done`  | s→c       | `{ conversationId }`                         | Ice-breaker stream ended                   |
| `chat:suggestions`      | s→c       | `{ conversationId, suggestions, forUserId }` | Smart reply chips                          |
| `friend:request`        | s→c       | `{ requestId, fromUserId, fromNickname }`    | Someone sent you a request                 |
| `friend:respond`        | s→c       | `{ requestId, accepted, byUserId }`          | Your request was answered                  |
| `friend:online`         | s→c       | `{ userId }`                                 | Friend comes online                        |
| `friend:offline`        | s→c       | `{ userId }`                                 | Friend goes offline                        |
| `call:invite`           | c→s & s→c | `{ conversationId, fromUserId }`             | Start of call signaling                    |
| `call:accept`           | c→s & s→c | same                                         | Callee picked up                           |
| `call:reject`           | c→s & s→c | same                                         | Callee declined                            |
| `call:offer`            | c→s↔c     | `{ conversationId, sdp }`                    | WebRTC SDP offer                           |
| `call:answer`           | c→s↔c     | `{ conversationId, sdp }`                    | WebRTC SDP answer                          |
| `call:ice-candidate`    | c→s↔c     | `{ conversationId, candidate }`              | Trickling ICE                              |
| `call:hangup`           | c→s & s→c | `{ conversationId, reason? }`                | Either side ends                           |
| `notification:new`      | s→c       | `{ id, type, payload, createdAt }`           | New notification pushed                    |

---

## 10. File map — where to find what

| Looking for…                            | Look here                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The login form UI                       | [apps/web/src/components/forms/login-form.tsx](apps/web/src/components/forms/login-form.tsx)                               |
| The chat UI (bubbles, composer, typing) | [apps/web/src/components/screens/chat-screen.tsx](apps/web/src/components/screens/chat-screen.tsx)                         |
| Where the JWT is signed                 | [apps/api/src/auth/auth.service.ts](apps/api/src/auth/auth.service.ts) — `issueTokens()`                                   |
| How the matchmaking queue works         | [apps/api/src/matchmaking/matchmaking.service.ts](apps/api/src/matchmaking/matchmaking.service.ts) — `MATCH_SCRIPT`        |
| How AI fallback peers are spawned       | [apps/api/src/ai-peer/ai-peer.service.ts](apps/api/src/ai-peer/ai-peer.service.ts)                                         |
| AI fallback reply prompt/runner         | [apps/api/src/ai-peer/ai-agent.runner.ts](apps/api/src/ai-peer/ai-agent.runner.ts)                                         |
| AI persona source                       | [apps/api/src/ai-peer/personas.json](apps/api/src/ai-peer/personas.json)                                                   |
| Mood/persona RAG seed sources           | [tone-packs.json](apps/api/src/ai-peer/tone-packs.json), [persona-stories.json](apps/api/src/ai-peer/persona-stories.json) |
| Chat personalization/RAG service        | [apps/api/src/ai-memory/ai-memory.service.ts](apps/api/src/ai-memory/ai-memory.service.ts)                                 |
| Embedding provider/fallback             | [apps/api/src/profiles/embedding.service.ts](apps/api/src/profiles/embedding.service.ts)                                   |
| The socket auth middleware              | [apps/api/src/realtime/realtime.gateway.ts](apps/api/src/realtime/realtime.gateway.ts) — `afterInit()`                     |
| What columns the User table has         | [packages/shared/prisma/schema.prisma](packages/shared/prisma/schema.prisma)                                               |
| The Tailwind theme tokens (colors)      | [apps/web/src/styles/globals.css](apps/web/src/styles/globals.css) — `@theme inline` block                                 |
| Where api URL is configured for the web | [apps/web/.env.example](apps/web/.env.example) — `NEXT_PUBLIC_API_URL`                                                     |
| Where the api env vars are documented   | [apps/api/.env.example](apps/api/.env.example)                                                                             |
| The Docker build for the api            | [apps/api/Dockerfile](apps/api/Dockerfile)                                                                                 |
| Railway service config                  | [railway.toml](railway.toml) (root!)                                                                                       |
| Vercel build config                     | [apps/web/vercel.json](apps/web/vercel.json)                                                                               |
| The E2E test suite                      | [apps/web/tests/e2e/](apps/web/tests/e2e/)                                                                                 |
| CI pipeline                             | [.github/workflows/ci.yml](.github/workflows/ci.yml)                                                                       |
| The original architectural plan         | [VENTLY_PLAN.md](VENTLY_PLAN.md)                                                                                           |
| Deployment runbook                      | [DEPLOY.md](DEPLOY.md)                                                                                                     |

---

## 11. Common tasks (how do I…)

### …add a new page on the web?

1. Create `apps/web/app/<group>/<route>/page.tsx`. Pick the group:
   - `(marketing)` if public + indexable.
   - `(auth)` if for sign-in flows.
   - `(app)` if requires login (gets the sidebar + ringer chrome via the layout).
2. Server component by default; add `'use client'` if you need hooks/state.
3. Add a link from somewhere in the existing nav (the sidebar in [shell/desktop-sidebar.tsx](apps/web/src/components/shell/desktop-sidebar.tsx) or a parent page).

### …add a new REST endpoint?

1. Find the appropriate module under [apps/api/src/](apps/api/src/). If there isn't one, create `feature/feature.module.ts` and add it to [app.module.ts](apps/api/src/app.module.ts).
2. Add a DTO under `feature/dto/` if you accept a body. Decorate fields with class-validator.
3. Add the controller method. Use `@UseGuards(JwtAuthGuard)` for protected routes, `@Public()` for not.
4. Use `@CurrentUser()` to read the authed user.
5. Add the typed client function in [apps/web/src/lib/api/](apps/web/src/lib/api/).

```ts
// In a controller:
@Get()
@UseGuards(JwtAuthGuard)
list(@CurrentUser() user: AuthUser) {
  return this.service.listForUser(user.userId);
}
```

### …add a new socket event?

1. Add a constant + payload type in [packages/shared/src/socket-events.ts](packages/shared/src/socket-events.ts). Add it to `ClientToServerEvents` and/or `ServerToClientEvents`.
2. Run `pnpm --filter @vently/shared build` so the types are emitted.
3. Subscribe on the api side in the relevant `*.gateway.ts` with `@SubscribeMessage(SocketEvents.YOUR_EVENT)`.
4. Subscribe on the web side via `useSocketEvent(SocketEvents.YOUR_EVENT, handler)`.

### …add a database column?

```bash
# 1. Edit packages/shared/prisma/schema.prisma to add the field.
# 2. Generate a migration (this also regenerates the Prisma client):
pnpm --filter @vently/shared exec prisma migrate dev --name describe_your_change
# 3. Commit the schema + the new migrations/<timestamp>_<name>/ folder.
```

In production, the api container's `CMD` runs `prisma migrate deploy` on startup — pending migrations apply automatically on the next Railway deploy. No manual step.

### …update AI personas, mood tone, or RAG behavior?

1. For who can appear in a mood, edit [apps/api/src/ai-peer/personas.json](apps/api/src/ai-peer/personas.json).
2. For richer character background/persona RAG, edit [apps/api/src/ai-peer/persona-stories.json](apps/api/src/ai-peer/persona-stories.json).
3. For mood-specific examples/rules, edit [apps/api/src/ai-peer/tone-packs.json](apps/api/src/ai-peer/tone-packs.json).
4. For prompt behavior, edit [apps/api/src/ai-peer/ai-agent.runner.ts](apps/api/src/ai-peer/ai-agent.runner.ts).
5. For memory extraction/retrieval policy, edit [apps/api/src/ai-memory/ai-memory.service.ts](apps/api/src/ai-memory/ai-memory.service.ts).
6. Run:

```bash
pnpm --filter @vently/api test
pnpm --filter @vently/api typecheck
pnpm --filter @vently/api build
pnpm format:check
```

Production notes:

- Template chunks are upserted on API startup, so changing `tone-packs.json` or `persona-stories.json` takes effect after the next Railway API deploy.
- Keep chat UI copy invisible: do not expose "AI", "RAG", or "AI memory" wording in conversation.
- Keep `LATE_NIGHT` time-aware: `AI_CHAT_TIME_ZONE` prevents daytime replies from saying "raat" or "1am".

### …rotate JWT secrets in production?

```bash
# Generate new random 32-byte hex values:
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET (must differ!)
```

Then on Railway: open the api service → Variables → paste in the new values → save. The api will restart automatically. **Existing JWTs will become invalid** so everyone has to re-login.

### …enable Google OAuth?

Not currently wired (deferred to V1). When you want it:

1. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in Railway.
2. Add a `passport-google-oauth20` strategy under [apps/api/src/auth/strategies/](apps/api/src/auth/strategies/).
3. Add `GET /auth/google` + `GET /auth/google/callback` controller routes.
4. On callback, upsert `User` by `googleId` or `email`, issue tokens, redirect to web.

### …upgrade Prisma / Next / NestJS / pnpm?

```bash
pnpm up --interactive --recursive --latest
```

Then `pnpm typecheck && pnpm build && pnpm --filter @vently/web exec playwright test` to make sure nothing broke.

### …debug a production issue?

```bash
# Tail the api logs live:
railway logs --service api -f

# In the Vercel dashboard, click the latest deploy → "Function Logs"
```

Common patterns:

- 401s in clusters → JWT secret rotation issue.
- Socket auth failures appear as `socket auth: ...` lines (we explicitly log them).
- Stuck WebRTC calls → check `chrome://webrtc-internals` in the browser; verify a `relay` candidate is present once TURN is configured.

### …delete a user (e.g. for a GDPR/abuse request)?

There's no UI yet. Via Prisma Studio (`pnpm db:studio`) — open the User row and delete; cascade rules remove the Profile and Sessions. Conversations are kept (other party would lose context otherwise).

---

## 12. Testing

### Playwright E2E

The suite lives at [apps/web/tests/e2e/](apps/web/tests/e2e/) and covers the current browser-facing app:

```bash
# Run against local stack (web :3000, api :4000):
pnpm --filter @vently/web exec playwright test

# Run against production:
E2E_WEB_URL=https://vently-web-gamma.vercel.app \
E2E_API_URL=https://api-production-7fe02.up.railway.app \
  pnpm --filter @vently/web exec playwright test
```

Tests:

- [01-auth.spec.ts](apps/web/tests/e2e/01-auth.spec.ts) — register flow, protected route gate, bad-creds toast
- [02-chat-flow.spec.ts](apps/web/tests/e2e/02-chat-flow.spec.ts) — two browser contexts, real match + chat + friend
- [03-safety.spec.ts](apps/web/tests/e2e/03-safety.spec.ts) — report endpoint + notification flow
- [04-webrtc.spec.ts](apps/web/tests/e2e/04-webrtc.spec.ts) — `/webrtc/ice-servers` returns usable list
- [05-translate.spec.ts](apps/web/tests/e2e/05-translate.spec.ts) — translation flow
- [06-sprint1-features.spec.ts](apps/web/tests/e2e/06-sprint1-features.spec.ts) — search, reactions, delete, reply, push-related chat polish
- [07-ai-fallback.spec.ts](apps/web/tests/e2e/07-ai-fallback.spec.ts) — AI fallback chat, hidden human-only actions, report/search regressions

Current focused local verification for the AI personalization/RAG work:

```bash
pnpm --filter @vently/api test        # 8 suites / 48 tests
pnpm --filter @vently/api typecheck
pnpm --filter @vently/api build
pnpm format:check
```

Current production smoke coverage:

- API `/health`
- Railway runtime logs
- Profile "Chat personalization" visibility and hidden AI/RAG wording
- AI fallback chat opens and replies
- `LATE_NIGHT` daytime prompt guard: no false "raat/night/1am/neend" in the tested reply

### 🤖 Testing agent (one command, full app)

`pnpm test:agent` provisions **3 real accounts** (Alice MALE, Bob FEMALE, Charlie MALE), drives the entire app through 11 scenarios, and saves screenshots at every step. Works against **either** the live production deploy _or_ a local stack — same suite, just flip an env var.

```bash
# Drive PRODUCTION (default — vently-web-gamma.vercel.app + Railway api):
pnpm --filter @vently/web test:agent

# Drive LOCAL (your dev servers on :3000 / :4000):
pnpm --filter @vently/web test:agent:local

# Open the HTML report after a run (with screenshots + traces):
pnpm --filter @vently/web test:agent:report

# Visual UI mode (step through each test):
pnpm --filter @vently/web test:agent:ui
```

What it verifies, in order (each ✓ has a screenshot in `apps/web/agent-results/`):

1. Welcome page loads + shows public CTAs for anonymous visitors
2. `/home` shows "Continue as `<nickname>`" for logged-in users (auth-aware)
3. `/profile` renders the persisted nickname
4. Bob queues → Alice queues → both land in the SAME `/chat/[id]`
5. Realtime message round-trip both directions (<1s)
6. Friend request → Bob accepts → "You're now friends!" system message → Alice appears in Bob's connections
7. Notification bell renders with unread state
8. Block API: Charlie blocks Alice → block list contains Alice
9. Report API: Charlie reports Alice → 201 with persisted row
10. `/webrtc/ice-servers` returns STUN + TURN URLs (Open Relay)
11. `/health` returns `{ status: ok, postgres: ok, redis: ok }`

Source: [apps/web/tests/agent/full-flow.spec.ts](apps/web/tests/agent/full-flow.spec.ts). Config: [apps/web/playwright.agent.config.ts](apps/web/playwright.agent.config.ts). Helpers: [apps/web/tests/agent/helpers.ts](apps/web/tests/agent/helpers.ts).

Running cost on production: ~3 new accounts in the Postgres + a few `Report`/`Block`/`FriendRequest` rows. Use Prisma Studio (`pnpm db:studio` pointed at the Railway DB) to clean up if you want, but they're harmless.

If you see a `⚠️ Alice ↔ Bob matched with strangers` warning when running against prod, it's because real users were in the matchmaking queue at the same instant. The test still passes the rest of the suite and the warning tells you to retry.

### Manual smoke test (5 minutes, before any deploy)

1. Register a new account → land on `/onboarding`
2. Fill nickname + Male + 18+ checkbox → land on `/mood`
3. Pick a mood → `/matching` spinner
4. Open an incognito window, register Female user, same mood
5. Both should land on `/chat/[id]` within ~5s
6. Send a message both ways
7. Save-as-friend → other accepts → "You're now friends!" appears
8. Hit the Phone icon → ringback + ringtone → answer → audio works
9. Hang up → confirm `CallSession` row exists in Prisma Studio
10. Report dialog → confirm `Report` row exists

---

## 13. Deployment

Full walkthrough in [DEPLOY.md](DEPLOY.md). Quick reference:

**Web (Vercel)** — `apps/web/`:

- Auto-deploys on push to `main` once the GitHub integration is connected in the Vercel project.
- For manual: `vercel deploy --prod --yes` from the repo root.
- Project settings: `Root Directory = apps/web` (already set via API call we did at setup).
- Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`.

**API (Railway)** — Docker-based from [apps/api/Dockerfile](apps/api/Dockerfile):

- For manual: `railway up --service api --detach` from the repo root.
- Project settings: `railway.toml` (root) pins it to the Dockerfile builder.
- Env vars: see [apps/api/.env.example](apps/api/.env.example) — at minimum `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CORS_ORIGIN=<your-vercel-url>`.
- Prisma migrations run automatically on container start (`CMD` in the Dockerfile).
- AI-related production env:
  - `GROQ_API_KEY` — enables AI fallback replies, ice-breakers, suggestions, and translation.
  - `GEMINI_API_KEY` — enables Gemini semantic embeddings for RAG.
  - `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`.
  - `AI_FALLBACK_ENABLED=true` and `AI_FALLBACK_MS=8000` for fallback matching.
  - `AI_CHAT_TIME_ZONE=Asia/Kolkata` so AI replies do not invent the wrong time of day.
  - `AI_FALLBACK_TEST_MODE=false` in production.
- Push-related production env:
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
  - Web must also have `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

**Costs (current scale):** **$0** until you exceed Railway's free $5/mo credit. Vercel Hobby is free.

---

## 14. Troubleshooting

| Symptom                                                   | Probable cause                                                                                        | Fix                                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` fails with peer-dep error                  | React 19 conflict                                                                                     | `pnpm install --no-strict-peer-dependencies` (already in `.npmrc`)                                                                                              |
| `Prisma client missing` on api start                      | Migration not generated                                                                               | `pnpm --filter @vently/shared exec prisma generate`                                                                                                             |
| `Cannot find module 'dist/main.js'`                       | API not built                                                                                         | `pnpm --filter @vently/api build`                                                                                                                               |
| API logs say "Prisma failed to detect libssl/openssl"     | Using Alpine Docker base                                                                              | We're on `node:20-slim` with `apt-get install openssl` — make sure your Dockerfile changes preserve that                                                        |
| Voice call stuck at "Connecting…"                         | Likely a regression of the SDP race bug — caller emitted offer before peer was ready                  | See [§6.5](#65-voice-calling-webrtc); flow is: caller waits for `call:accept` before emitting offer                                                             |
| Matching never finds anyone                               | Other user's socket isn't connecting                                                                  | Check `chrome://devtools` Network panel for the socket connection; ensure `transports: ['polling', 'websocket']` (not websocket-only) — some carriers block WSS |
| Refresh on `/home` shows anonymous CTAs                   | `AuthBootstrap` not running on marketing                                                              | Should be in root layout. If it regresses, ensure [apps/web/app/layout.tsx](apps/web/app/layout.tsx) wraps children with `<AuthBootstrap>`                      |
| Cookie not being sent cross-domain                        | `SameSite=Lax` in production                                                                          | Must be `SameSite=None; Secure` when api ≠ web domain. See [auth.controller.ts](apps/api/src/auth/auth.controller.ts) `setRefreshCookie`                        |
| CORS rejecting the web origin                             | `CORS_ORIGIN` env not updated                                                                         | Update on Railway dashboard, no code change needed; the api re-reads on each request                                                                            |
| Tailwind classes not applying after edit                  | Tailwind v4 doesn't watch new files automatically in dev                                              | Restart `pnpm dev`                                                                                                                                              |
| `next dev` SSR errors with "Unexpected end of JSON input" | next/font flaking with Google Fonts                                                                   | We use system fonts now (see `apps/web/app/layout.tsx`). Don't reintroduce `next/font/google` without a local fallback.                                         |
| AI fallback leaves user on "Looking for someone…"         | `AI_FALLBACK_ENABLED` false, `GROQ_API_KEY` missing, `VOICE_ONLY` mood, or no persona for mood/gender | Check Railway vars + logs. `AIPeerService` should log `Loaded 20 AI personas`; `AIAgentRunner` should log Groq ready.                                           |
| AI chat says "raat/night/1am" during day                  | Missing/wrong `AI_CHAT_TIME_ZONE` or prompt regression                                                | Set `AI_CHAT_TIME_ZONE=Asia/Kolkata`; run `ai-agent.runner.spec.ts` and a prod `LATE_NIGHT` smoke.                                                              |
| RAG feels weak/generic                                    | Gemini key missing or embeddings falling back locally                                                 | Check logs for `Embedding service enabled (Gemini / gemini-embedding-001)`; verify `GEMINI_API_KEY` on Railway.                                                 |
| User sees "AI memory" or "RAG" in UI                      | Copy regression in profile/chat                                                                       | User-facing copy should say **Chat personalization** only; chat should not expose RAG/memory wording.                                                           |

---

## 15. Glossary

- **DTO** — Data Transfer Object. The shape of a request body or response.
- **Gateway** (NestJS) — A class that handles Socket.io events. Decorated with `@WebSocketGateway()`.
- **Guard** (NestJS) — Middleware-style class that decides if a request is allowed (e.g. `JwtAuthGuard`).
- **RSC** — React Server Component. Renders on the server, doesn't ship JS to the client.
- **SSR** — Server-Side Rendering. Next.js renders the initial HTML on the server.
- **JWT** — JSON Web Token. Signed string carrying claims like `{ sub: userId, exp: …, role: … }`.
- **httpOnly cookie** — Cookie that JavaScript can't read. Mitigates XSS theft.
- **RAG** — Retrieval-Augmented Generation. Here: semantic lookup of mood/persona/user memory chunks before an AI reply.
- **Embedding** — Numeric vector representation of text. Stored as JSON for v1 and ranked in app code.
- **AI fallback peer** — Ephemeral Redis-backed persona used when human matchmaking times out.
- **Chat personalization** — User-facing name for safe distilled memory controls. Do not call it RAG/AI memory in UI.
- **STUN** — Server that helps clients discover their public IP/port for WebRTC.
- **TURN** — Relay server that proxies WebRTC media when direct P2P fails.
- **SDP** — Session Description Protocol. The big text blob exchanged in WebRTC offer/answer.
- **ICE candidate** — A potential network path (IP:port) for WebRTC connectivity.
- **Sorted set** (Redis) — A set of members with associated numeric scores. Used for the matchmaking queue (score = timestamp → FIFO).
- **Lua script** (Redis) — A short Lua program that runs atomically inside Redis. Used for atomic matchmaking pop-and-pair.
- **Prisma migration** — A SQL file generated from a schema change. Committed; applied in order.
- **Workspace** (pnpm) — A package within the monorepo, referenced as `workspace:*` in dependent package.jsons.

---

If you read this far, you should be able to:

- Find any feature's code in <30 s.
- Add a new endpoint or socket event without breaking anything.
- Debug a stuck deploy in 5 minutes.
- Explain to someone else how matchmaking works without opening the codebase.

For the original architectural rationale (why this stack, why these choices), see [VENTLY_PLAN.md](VENTLY_PLAN.md).

Welcome to Vently. 🟣🩷🔵
