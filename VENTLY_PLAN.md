# Vently — Production Build Plan

Anonymous emotional chat + voice calling app. Migrate the existing Figma-generated Vite/React UI at [Design Vently Chat App/](src/) into a production-ready Turborepo monorepo with a Next.js 15 web app + NestJS API, shipping in a phased MVP over ~9 weeks.

---

## Context

**What exists today:** A Vite + React 18 + React Router 7 + Tailwind v4 SPA with 10 fully designed screens (Splash, Welcome, Onboarding, Mood, Matching, Chat, VoiceCall, Connections, Profile, Home), 4 custom components (Button, GlassCard, AnimatedBackground, Navigation), 45+ shadcn/ui primitives, dark-only glass-morphism theme, and localStorage-only persistence. No backend, no real auth, no real WebRTC, mock chat responses, hard-coded connection list.

**Why we're rebuilding:** The Figma UI is a visual contract — the source of truth. To ship Vently as a real product we need authenticated identity, persistent friendships, realtime matchmaking and chat across users, WebRTC voice calls, safety/moderation, and a deployment story. The existing screens are reused 1:1; we add the backend, replace mocks with real APIs/sockets, and migrate the shell from Vite SPA to Next.js App Router so we can scale (SSR for marketing, server components, middleware-guarded app group).

**Outcome:** A Turborepo monorepo (`apps/web` + `apps/api` + `packages/shared` + `packages/ui` + `packages/config`) running on Vercel (web) + Railway (api/Postgres/Redis), with Cloudflare Calls/Metered for TURN, shipping a usable MVP (auth + matching + text chat + friends) in ~5 weeks and full V1 (voice + safety + notifications) by week 9.

**Locked decisions** (confirmed with user):
- Frontend: **Migrate to Next.js 15 App Router** (React 19, Tailwind v4, shadcn/ui, Framer Motion, Zustand, TanStack Query, react-hook-form + Zod).
- Backend: **NestJS** + Prisma + PostgreSQL + Redis + Socket.io + Passport (JWT + Google OAuth).
- Repo: **Turborepo monorepo** with pnpm workspaces.
- TURN: **Managed (Cloudflare Calls or Metered.ca)** — no self-hosted coturn.
- Auth: **Self-built** with NestJS + Passport (JWT access in memory + rotating refresh in httpOnly cookie).
- Deployment: **Vercel (web) + Railway (api + Postgres + Redis)**.
- Delivery: **Phased MVP → V1 → V2**.

---

## 1. Monorepo Layout

```
vently/
├── apps/
│   ├── web/                          # Next.js 15 (App Router, React 19)
│   └── api/                          # NestJS 10 + Prisma
├── packages/
│   ├── shared/                       # Cross-app contracts
│   │   ├── src/
│   │   │   ├── socket-events.ts      # Event name constants + payload types
│   │   │   ├── types/                # User, Profile, Conversation, Message, Friend, Call, Notification
│   │   │   └── schemas/              # Zod schemas (login, register, profile, report)
│   │   └── prisma/schema.prisma      # Single source of truth for DB types
│   ├── ui/                           # Reusable component library
│   │   ├── primitives/               # shadcn/ui re-exports
│   │   └── components/               # Button, GlassCard, AnimatedBackground, Avatar
│   └── config/                       # tsconfig.base, eslint, prettier, tailwind preset
├── docker-compose.yml                # Local Postgres + Redis
├── turbo.json
├── pnpm-workspace.yaml
└── .github/workflows/                # CI: typecheck, lint, build, prisma validate
```

---

## 2. apps/web — Next.js Frontend

### 2.1 Route map (Vite → App Router)

Three route groups under `app/`:

| Current Vite route ([src/app/App.tsx](src/app/App.tsx)) | New App Router segment | Group | Type |
|---|---|---|---|
| `/` SplashScreen | `app/(marketing)/page.tsx` | marketing | Server + small client redirect |
| `/welcome` WelcomeScreen | `app/(marketing)/welcome/page.tsx` | marketing | RSC (static) |
| `/home` HomeScreen | `app/(marketing)/home/page.tsx` | marketing | RSC (static, indexable) |
| (new) | `app/(auth)/login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `auth/google/callback/page.tsx` | auth | Client (forms) |
| `/onboarding` | `app/(app)/onboarding/page.tsx` | app | Client |
| `/mood` MoodSelection | `app/(app)/mood/page.tsx` | app | Client |
| `/matching` | `app/(app)/matching/page.tsx` | app | Client (sockets) |
| `/chat` ChatScreen | `app/(app)/chat/[conversationId]/page.tsx` | app | Client (sockets) |
| `/voice-call` | `app/(app)/call/[conversationId]/page.tsx` | app | Client (WebRTC) |
| `/connections` | `app/(app)/connections/page.tsx` | app | Client (TanStack Query) |
| `/profile` | `app/(app)/profile/page.tsx` | app | Client |

Route group layouts (`app/(app)/layout.tsx`) host the `<MobileNavigation>` + `<DesktopSidebar>` shell. `app/(marketing)/layout.tsx` and `app/(auth)/layout.tsx` have no app chrome. `middleware.ts` protects the `(app)` group: missing/invalid token → redirect to `/login`.

### 2.2 Folder structure (apps/web/)

```
apps/web/
├── app/
│   ├── layout.tsx                    # Root layout, fonts, ThemeProvider, QueryProvider, Toaster
│   ├── (marketing)/{page,welcome,home}/page.tsx
│   ├── (auth)/{login,register,forgot-password}/page.tsx + auth/google/callback/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                # Sidebar + bottom nav, SocketProvider, AuthGuard
│   │   ├── onboarding/page.tsx
│   │   ├── mood/page.tsx
│   │   ├── matching/page.tsx
│   │   ├── chat/[conversationId]/page.tsx
│   │   ├── call/[conversationId]/page.tsx
│   │   ├── connections/page.tsx
│   │   └── profile/page.tsx
│   └── api/                          # Route handlers (only if needed, mostly empty)
├── middleware.ts                     # Auth guard for (app)
├── src/
│   ├── components/                   # App-specific (not in packages/ui)
│   │   ├── chat/{MessageBubble,Composer,TypingIndicator,ChatHeader}.tsx
│   │   ├── matching/{MoodTile,MatchAnimation}.tsx
│   │   ├── call/{CallControls,CallSurface}.tsx
│   │   ├── friends/{FriendRequestCard,ConnectionListItem}.tsx
│   │   ├── safety/{ReportDialog,BlockDialog}.tsx
│   │   ├── shell/{MobileNavigation,DesktopSidebar,ResponsiveShell,SplitView}.tsx
│   │   └── notifications/{NotificationBell,NotificationDrawer}.tsx
│   ├── lib/
│   │   ├── api/                      # REST client: client.ts, auth.ts, users.ts, friends.ts, conversations.ts, messages.ts, reports.ts, notifications.ts
│   │   ├── socket/                   # socket.ts singleton, events.ts typed bindings, useSocket(), useSocketEvent()
│   │   ├── webrtc/                   # useWebRTC.ts, iceServers.ts, callMachine.ts
│   │   ├── auth/                     # getSession (server), refresh.ts
│   │   └── utils/                    # avatarSeed.ts, formatTime.ts, profanity.ts (client preview)
│   ├── stores/                       # Zustand: authStore, uiStore, chatStore, callStore, matchStore
│   ├── hooks/                        # useDebounce, useIntersection, useMediaQuery, useResponsive
│   └── styles/                       # globals.css (port from src/styles/theme.css), tailwind.css
├── next.config.ts
└── package.json
```

### 2.3 State management

- **Zustand** stores (one file each in `src/stores/`):
  - `authStore` — `{ user, accessToken, setAuth, clear }` (refresh token stays in httpOnly cookie; access token in memory only — never localStorage, for XSS safety).
  - `uiStore` — modals, drawers, current responsive breakpoint.
  - `chatStore` — `{ activeConversationId, drafts, typingPeers }`.
  - `callStore` — call state machine `IDLE | DIALING | RINGING | CONNECTING | CONNECTED | ENDED`.
  - `matchStore` — `{ ticketId, mood, status, startedAt }`.
- **TanStack Query** keys: `['me']`, `['friends']`, `['conversations']`, `['conversations', id, 'messages', cursor]`, `['notifications']`. Socket events `setQueryData` to merge live updates. Stale time 30s for lists, 0 for active message list (sockets own freshness).
- **Forms** — react-hook-form + Zod resolvers (schemas imported from `packages/shared/schemas`).

### 2.4 API client (`src/lib/api/client.ts`)

Fetch wrapper. On 401, calls `POST /auth/refresh` (httpOnly cookie auto-attached), retries once. Throws normalized `ApiError`. One module per resource exports typed functions: `getMe()`, `updateProfile(body)`, `listFriends()`, `sendMessage(convId, body)`, `listMessages(convId, cursor)`, `createReport(body)`, etc.

### 2.5 Socket client (`src/lib/socket/socket.ts`)

Singleton `io(API_URL, { auth: { token: accessToken } })`. Connect after auth, disconnect on logout. Reconnect with backoff. `useSocket()` returns the instance; `useSocketEvent(event, handler)` subscribes with auto-unsubscribe on unmount. Event names + payload types imported from `@vently/shared/socket-events`. Examples:

```ts
useSocketEvent(SocketEvents.CHAT_MESSAGE, (msg) => {
  queryClient.setQueryData(['conversations', msg.conversationId, 'messages'], (old) => append(old, msg));
});
```

### 2.6 WebRTC (`src/lib/webrtc/useWebRTC.ts`)

Hook signature:

```ts
const {
  localStream, remoteStream, callState,
  startCall, acceptCall, rejectCall, hangup,
  toggleMute, toggleSpeaker
} = useWebRTC({ conversationId, peerUserId });
```

State machine + signaling via socket (`call:offer`, `call:answer`, `call:ice-candidate`, `call:hangup`). ICE servers fetched from `GET /webrtc/ice-servers` (short-lived TURN creds). Handles permission denial, mic-only (no video for MVP), prefers-reduced-motion in the call animation.

### 2.7 Component reuse plan

Move from current Vite project into `packages/ui/`:
- All [src/app/components/ui/](src/app/components/ui/) shadcn primitives → `packages/ui/primitives/`.
- [src/app/components/Button.tsx](src/app/components/Button.tsx), [GlassCard.tsx](src/app/components/GlassCard.tsx), [AnimatedBackground.tsx](src/app/components/AnimatedBackground.tsx) → `packages/ui/components/`.
- `Navigation.tsx` splits → moved into `apps/web/src/components/shell/` (app-specific routing logic stays in the web app).

New app-specific components live in `apps/web/src/components/` (chat, matching, call, friends, safety, shell, notifications).

### 2.8 Responsive shell

Mobile-first Tailwind. Breakpoints sm 640 / md 768 / lg 1024 / xl 1280.
- **<768:** Stacked, bottom tab bar, full-bleed.
- **768–1024:** Wider bubbles, optional 2-pane on connections.
- **≥1024:** 3-pane (`<SplitView>`): left sidebar rail, middle list, right active surface.

`<ResponsiveShell>` picks layout via `useMediaQuery`. Touch targets ≥44px. `prefers-reduced-motion` disables `AnimatedBackground` particle layer.

### 2.9 Styling migration

Port [src/styles/theme.css](src/styles/theme.css) → `apps/web/src/styles/globals.css`. Tailwind v4 single-file config works in Next.js with `@tailwindcss/postcss`. Add `next/font` Inter. Keep the indigo/pink/blue palette + glass utility classes intact.

---

## 3. apps/api — NestJS Backend

### 3.1 Module structure

```
apps/api/src/
├── main.ts                           # NestFactory, helmet, cors, ValidationPipe, global filters
├── app.module.ts                     # Imports all feature modules + ConfigModule + PrismaModule + RedisModule
├── common/
│   ├── filters/HttpExceptionFilter.ts
│   ├── interceptors/LoggingInterceptor.ts
│   ├── guards/JwtAuthGuard.ts, RolesGuard.ts
│   ├── decorators/CurrentUser.ts, Roles.ts
│   └── pipes/ZodValidationPipe.ts
├── prisma/PrismaService.ts
├── redis/RedisService.ts
├── auth/
│   ├── auth.module.ts, auth.controller.ts, auth.service.ts
│   ├── strategies/{jwt,google,refresh}.strategy.ts
│   ├── dto/{register,login,refresh}.dto.ts
│   └── repositories/session.repository.ts
├── users/{users.module,users.controller,users.service,users.repository}.ts
├── profiles/{profiles.module,profiles.controller,profiles.service,profiles.repository}.ts
├── matchmaking/
│   ├── matchmaking.module.ts, matchmaking.service.ts
│   ├── queue.lua                     # Atomic pop-and-match script
│   └── matchmaking.gateway.ts        # Socket handlers
├── chat/
│   ├── chat.module.ts, chat.gateway.ts
│   ├── messages.controller.ts, messages.service.ts, messages.repository.ts
│   └── conversations.controller.ts, conversations.service.ts, conversations.repository.ts
├── friends/{friends.module,friends.controller,friends.service,friends.repository,friends.gateway}.ts
├── calls/{calls.module,calls.controller,calls.service,calls.gateway}.ts
├── webrtc/{webrtc.module,webrtc.controller,ice.service}.ts   # ICE server creds
├── reports/{reports.module,reports.controller,reports.service,reports.repository}.ts
├── blocks/{blocks.module,blocks.controller,blocks.service,blocks.repository}.ts
├── notifications/{notifications.module,notifications.controller,notifications.service,notifications.repository,notifications.gateway}.ts
├── moderation/{moderation.module,moderation.service,profanity.filter}.ts
├── presence/{presence.module,presence.service,presence.gateway}.ts
└── realtime/realtime.gateway.ts      # Single Socket.io gateway aggregating all events
```

Each feature module follows: Module → Controller (REST) → Service (business logic) → Repository (Prisma) → DTOs (class-validator). Gateways are separate (Socket.io). Repository pattern keeps Prisma off the service layer surface.

### 3.2 Prisma schema (highlights)

`packages/shared/prisma/schema.prisma`:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?
  googleId      String?   @unique
  role          Role      @default(USER)
  createdAt     DateTime  @default(now())
  profile       Profile?
  sessions      Session[]
  @@index([email])
}

model Profile {
  userId       String      @id
  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  nickname     String      @unique
  gender       Gender
  bio          String?
  avatarSeed   String
  mood         MoodIntent?
  isOnline     Boolean     @default(false)
  lastSeenAt   DateTime    @default(now())
  @@index([isOnline, gender])
}

model Session {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshTokenHash String
  deviceInfo       String?
  expiresAt        DateTime
  createdAt        DateTime @default(now())
  @@index([userId])
}

model Conversation {
  id           String   @id @default(cuid())
  type         ConvType @default(DIRECT)
  createdAt    DateTime @default(now())
  endedAt      DateTime?
  participants ConversationParticipant[]
  messages     Message[]
  calls        CallSession[]
}

model ConversationParticipant {
  conversationId String
  userId         String
  joinedAt       DateTime @default(now())
  leftAt         DateTime?
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@id([conversationId, userId])
  @@index([userId])
}

model Message {
  id             String        @id @default(cuid())
  conversationId String
  senderId       String
  body           String
  type           MessageType   @default(TEXT)
  createdAt      DateTime      @default(now())
  deletedAt      DateTime?
  conversation   Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  receipts       MessageReceipt[]
  @@index([conversationId, createdAt])
}

model MessageReceipt {
  messageId   String
  userId      String
  deliveredAt DateTime?
  readAt      DateTime?
  message     Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  @@id([messageId, userId])
}

model FriendRequest {
  id         String   @id @default(cuid())
  fromUserId String
  toUserId   String
  status     FriendReqStatus @default(PENDING)
  createdAt  DateTime @default(now())
  @@unique([fromUserId, toUserId])
  @@index([toUserId, status])
}

model Friendship {
  userAId   String
  userBId   String              // userAId < userBId enforced in service
  createdAt DateTime @default(now())
  @@id([userAId, userBId])
}

model Block {
  blockerId String
  blockedId String
  createdAt DateTime @default(now())
  @@id([blockerId, blockedId])
  @@index([blockedId])
}

model Report {
  id             String   @id @default(cuid())
  reporterId     String
  reportedId     String
  conversationId String?
  reason         String
  details        String?
  status         ReportStatus @default(OPEN)
  createdAt      DateTime @default(now())
  @@index([status])
}

model CallSession {
  id             String   @id @default(cuid())
  conversationId String
  callerId       String
  calleeId       String
  startedAt      DateTime @default(now())
  endedAt        DateTime?
  durationSec    Int?
  endReason      String?
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  @@index([conversationId])
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      NotifType
  payload   Json
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
}

model ModerationFlag {
  id        String   @id @default(cuid())
  messageId String?
  reason    String
  severity  Int
  action    String?
  createdAt DateTime @default(now())
}

enum Role { USER MOD ADMIN }
enum Gender { MALE FEMALE }
enum MoodIntent { LONELY NEED_TO_TALK FRIENDSHIP LATE_NIGHT ADVICE FLIRTY VOICE_ONLY }
enum ConvType { DIRECT FRIEND }
enum MessageType { TEXT SYSTEM }
enum FriendReqStatus { PENDING ACCEPTED REJECTED CANCELLED }
enum ReportStatus { OPEN REVIEWING RESOLVED }
enum NotifType { MATCH_FOUND MESSAGE FRIEND_REQUEST FRIEND_ACCEPTED MISSED_CALL SYSTEM }
```

Matchmaking tickets are **Redis-only** (sorted sets) — no Postgres model.

### 3.3 REST API surface

```
# Auth (public unless noted)
POST   /auth/register
POST   /auth/login
POST   /auth/refresh                  # cookie-based
POST   /auth/logout                   # auth
GET    /auth/google
GET    /auth/google/callback

# Me / Profile (auth)
GET    /me
PATCH  /me/profile
DELETE /me                            # account deletion (V1)

# Friends
GET    /friends
POST   /friends/requests
GET    /friends/requests
PATCH  /friends/requests/:id          # accept/reject
DELETE /friends/requests/:id          # cancel outgoing
DELETE /friends/:userId               # unfriend

# Conversations & Messages
GET    /conversations
GET    /conversations/:id
GET    /conversations/:id/messages?cursor=&limit=
DELETE /conversations/:id             # leave/end

# Blocks
GET    /blocks
POST   /blocks
DELETE /blocks/:userId

# Reports
POST   /reports

# Notifications
GET    /notifications
PATCH  /notifications/:id/read
PATCH  /notifications/read-all

# WebRTC
GET    /webrtc/ice-servers            # short-lived TURN creds

# Ops
GET    /health
GET    /metrics                       # V1
```

### 3.4 Socket.io event catalog

All names in `packages/shared/src/socket-events.ts` as a `const` object. Auth via JWT in `handshake.auth.token`. On connect: join `user:${userId}` room, emit presence online.

**Presence:** `presence:online` (s→c), `presence:offline` (s→c), `presence:heartbeat` (c→s, every 25s).

**Matchmaking:** `match:join` (c→s `{mood, preferredGender?}`), `match:cancel` (c→s), `match:found` (s→c `{conversationId, peer}`), `match:timeout` (s→c).

**Chat:** `chat:send` (c→s `{conversationId, body, clientId}`), `chat:message` (s→c full Message), `chat:ack` (s→c `{clientId, messageId}`), `chat:typing` (c→s `{conversationId, isTyping}`), `chat:typing-status` (s→c), `chat:read` (c→s `{conversationId, lastMessageId}`), `chat:read-status` (s→c).

**Friends:** `friend:request` (s→c), `friend:respond` (s→c), `friend:online`/`friend:offline` (s→c).

**Calls:** `call:invite` (c→s & s→c), `call:accept` (c→s), `call:reject` (c→s), `call:offer` (c↔s↔c, SDP), `call:answer` (c↔s↔c, SDP), `call:ice-candidate` (c↔s↔c), `call:hangup` (c↔s↔c).

**Notifications:** `notification:new` (s→c).

### 3.5 Auth flow

1. **Register** → Zod validate → bcrypt hash → create User + Profile shell → issue access (JWT, 15min) + refresh (random 64 bytes, hashed, stored in Session row, 30d) → set httpOnly refresh cookie + return access in body.
2. **Login** → same.
3. **Google OAuth** → passport-google-oauth20 → upsert by `googleId` or `email` → issue tokens.
4. **Refresh rotation** → verify refresh hash matches stored, delete old Session, create new Session, return new pair. If reuse detected (stored session already rotated), revoke all sessions for the user.
5. **Logout** → delete Session by refresh token + clear cookie.
6. **Guards** → `JwtAuthGuard` on all `(auth)` routes; `RolesGuard` for mod/admin.
7. **Rate limits** → `@nestjs/throttler`: 10/min on register/login, 30/min on refresh.

### 3.6 Matchmaking engine

Redis sorted sets keyed `queue:{mood}:{gender}`. Score = `Date.now()`.

```
match:join → push ticket → run Lua:
  ZRANGE queue:{mood}:{opposite_gender} 0 0 → get oldest opposite ticket
  if exists and not in blocked-pair set:
    ZREM both tickets atomically
    return both userIds
  else return nil
```

On match: create `Conversation` (type=DIRECT) + two `ConversationParticipant` rows → emit `match:found` to both user rooms.

**Edge cases:**
- 60s timeout sweeper (BullMQ) emits `match:timeout` and removes stale tickets.
- Block-list filter: maintain `blocks:{userId}` Redis set; skip tickets where peer is in blocker's set or vice versa.
- Recent-pair cooldown: 10-min Redis key `pair:{minId}:{maxId}` prevents instant rematch.
- Disconnect cleanup: socket disconnect removes user from all queues.

### 3.7 WebRTC signaling

P2P mesh (1:1). Sequence:
1. Caller emits `call:invite` → server forwards to callee's user room.
2. Callee `call:accept` (or `call:reject` → server forwards, ends).
3. Both clients `GET /webrtc/ice-servers` (Cloudflare/Metered creds, ~1h TTL).
4. Caller `pc.createOffer()` → `call:offer` → server relays to callee.
5. Callee `pc.setRemoteDescription` → `createAnswer` → `call:answer` → relay.
6. Both exchange `call:ice-candidate` as they trickle.
7. Either side `call:hangup` → server writes `CallSession` (durationSec, endReason).

Server-side validation: both parties are in the conversation, no block between them, no other active call.

### 3.8 Moderation & safety

- **Profanity filter:** `bad-words` lib + custom seed list, run on every `chat:send` before persist. Mild → flag, severe → reject + create `ModerationFlag`.
- **Per-socket rate limits:** chat:send max 10/sec; friend:request max 5/min; call:invite max 3/min.
- **Block enforcement:** chat send checks `Block` table; matchmaking filters in Redis; calls reject if blocked.
- **Reports:** `POST /reports` → row + ModerationFlag, admin reviews via dashboard (V1).
- **Soft delete** on Message (set `deletedAt`), never hard-delete (evidence).

### 3.9 Background jobs (BullMQ)

- `presence-sweeper` — every 30s, mark stale heartbeats offline.
- `match-timeout-sweeper` — every 5s, drop tickets older than 60s + emit timeout.
- `notification-dispatcher` (V1) — web push.
- `session-cleanup` — nightly, delete expired Session rows.

### 3.10 Env vars (`apps/api/.env.example`)

```
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=
TURN_PROVIDER=cloudflare|metered
TURN_API_KEY=
TURN_APP_ID=
CORS_ORIGIN=http://localhost:3000
COOKIE_DOMAIN=
NODE_ENV=development
PORT=4000
LOG_LEVEL=info
```

---

## 4. Deployment

### 4.1 Railway (backend)

Three services: `api` (Dockerfile multi-stage), `postgres`, `redis`. Migrations via `prisma migrate deploy` on release. Health `/health`. Logs via Railway's native log drain (pino structured JSON).

### 4.2 Vercel (web)

`apps/web` deployed via Vercel git integration. Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`. Build command `pnpm turbo run build --filter=web`. Edge middleware for auth guard.

### 4.3 CI/CD (`.github/workflows/`)

- `ci.yml` on PR: install → lint → typecheck → prisma validate → build (turbo cached).
- `deploy.yml` on push to main: Vercel deploys automatically; Railway CLI triggers backend deploy + migration.
- Branch protection: PR + 1 approver + green CI.

### 4.4 Observability

- Sentry on both apps (errors + perf).
- Pino structured logs on api → Railway log drain.
- Uptime monitor (UptimeRobot or Railway's built-in) on `/health`.
- OpenTelemetry traces (V1).

---

## 5. Security checklist

- Helmet + strict CORS allowlist + HSTS.
- Access token in memory only (Zustand); refresh in httpOnly + Secure + SameSite=Lax cookie.
- Refresh-token rotation with reuse-detection → revoke all sessions on suspected theft.
- bcrypt cost 12; password min 8 chars + mixed (Zod).
- Account lockout after 5 failed logins in 15min (Redis counter).
- `@nestjs/throttler` global + per-route.
- Zod/class-validator on every input; Prisma parameterization (auto).
- TURN creds short-lived (1h).
- No PII in logs (pino redact `password`, `token`, `email`).
- Socket auth in handshake; reject unauth connections immediately.
- CSP header on web (next config).

---

## 6. Phased MVP Roadmap

**Phase 0 — Foundation (Week 1)**
- Init Turborepo, pnpm workspaces, `apps/web` (Next.js 15), `apps/api` (NestJS), `packages/{shared,ui,config}`.
- Move shadcn primitives + Button/GlassCard/AnimatedBackground to `packages/ui`.
- Port 10 screens 1:1 to Next.js App Router (visual only, mocked data still). Visual parity confirmed.
- Docker Compose: Postgres + Redis. Prisma init + migrate. NestJS skeleton running.
- CI: typecheck/lint/build green on PR.

**Phase 1 — Auth + Profile (Week 2)**
- NestJS: `auth`, `users`, `profiles` modules. Register, login, refresh, logout, Google OAuth.
- Web: `/login`, `/register`, `/forgot-password` (stub), `/onboarding` wired to API. `middleware.ts` protects `(app)`.
- Zustand `authStore` + `lib/auth/refresh.ts` silent refresh.

**Phase 2 — Realtime + Matchmaking + Chat (Weeks 3–4)**
- NestJS: Socket.io gateway with Redis adapter, `presence`, `matchmaking` (Redis queue + Lua), `chat` (conversations + messages + receipts).
- Web: `lib/socket/` client, `/mood` → `/matching` → `/chat/[id]` flow. Optimistic send, typing, read receipts. Connection-lost banner.
- Bulk: persist 30 days of messages.

**Phase 3 — Friends + Connections (Week 5)**
- NestJS: `friends`, `blocks` modules + gateway events. FriendRequest, Friendship, Block tables wired.
- Web: "Save as friend" in chat header, requests inbox, `/connections` resumable chats.
- **MVP shippable here.**

**Phase 4 — Voice calling (Weeks 6–7)**
- TURN provider (Cloudflare Calls) setup; `GET /webrtc/ice-servers`.
- NestJS: `calls`, `webrtc` modules + signaling events. `CallSession` persistence.
- Web: `useWebRTC` hook, call invite UI, `/call/[id]` page, in-app ringer.

**Phase 5 — Safety + Notifications (Week 8)**
- `reports`, `moderation`, `notifications` modules. Profanity filter on chat:send. Rate limits per socket event.
- Web: report/block dialogs, notification bell + drawer.

**Phase 6 — Polish + Deploy V1 (Week 9)**
- Error boundaries on every route, loading skeletons, empty states.
- Accessibility audit (axe + manual): aria-live regions for chat/call/match, focus traps, color contrast.
- Sentry on both apps. Production deploy: Railway + Vercel + domain + TLS. Smoke tests.

**Post-V1 backlog**
- Web push notifications (VAPID + service worker).
- Email verification + password reset (Resend).
- Admin moderation dashboard.
- Avatar uploads + image moderation (Cloudflare R2 + Sightengine).
- React Native client reusing `packages/shared` + `packages/ui` adapter.
- SFU for group calls (LiveKit) if voice rooms get added.

---

## 7. Feature dependency map

```
Foundation
  └─> Auth ──> Profile ──> Onboarding
                            └─> Sockets+Presence ──> Matchmaking ──> Conversations+Messages ──> Chat UI
                                                                              └─> Friends ──> Connections page
                                                                                       └─> Calls (WebRTC)
                                                                                              └─> Safety+Notifications
                                                                                                       └─> Polish+Deploy
```

Backend-first per slice: every web feature depends on the API endpoint or socket event existing. Build API + types in `packages/shared` first each phase, then wire web.

---

## 8. File creation order (executable handoff)

1. Root: `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `docker-compose.yml`.
2. `packages/config/{tsconfig.base.json,eslint-config.js,prettier.config.js,tailwind-preset.js}`.
3. `packages/shared/{package.json,src/index.ts,src/socket-events.ts,src/types/*.ts,src/schemas/*.ts,prisma/schema.prisma}`.
4. `apps/api/{package.json,nest-cli.json,tsconfig.json,src/main.ts,src/app.module.ts,prisma/seed.ts,.env.example}` → then `common/`, `prisma/`, `redis/`, `auth/`, `users/`, `profiles/` (Phase 1).
5. `packages/ui/{package.json,primitives/*,components/*}` (port from current [src/app/components/](src/app/components/)).
6. `apps/web/{package.json,next.config.ts,middleware.ts,app/layout.tsx,app/(marketing)/*,app/(auth)/*,app/(app)/*,src/{stores,lib,components,hooks,styles}/*}`.
7. `.github/workflows/{ci.yml,deploy.yml}`.

---

## 9. Critical files to modify or create (reference)

**Reused from current Vite project** (copy/adapt, do NOT rewrite from scratch):
- [src/app/components/Button.tsx](src/app/components/Button.tsx) → `packages/ui/components/Button.tsx`
- [src/app/components/GlassCard.tsx](src/app/components/GlassCard.tsx) → `packages/ui/components/GlassCard.tsx`
- [src/app/components/AnimatedBackground.tsx](src/app/components/AnimatedBackground.tsx) → `packages/ui/components/AnimatedBackground.tsx`
- [src/app/components/Navigation.tsx](src/app/components/Navigation.tsx) → `apps/web/src/components/shell/{MobileNavigation,DesktopSidebar}.tsx`
- [src/app/components/ui/](src/app/components/ui/) (all 45+ shadcn primitives) → `packages/ui/primitives/`
- All 10 screen files under [src/app/screens/](src/app/screens/) → `apps/web/app/(marketing|auth|app)/.../page.tsx` (split client/server as noted in §2.1)
- [src/styles/theme.css](src/styles/theme.css) → `apps/web/src/styles/globals.css`
- [default_shadcn_theme.css](default_shadcn_theme.css) → merged into `globals.css`

**New (no current equivalent):** every file under `apps/api/`, `packages/shared/`, `apps/web/src/{lib,stores,hooks}/`, `apps/web/middleware.ts`, `docker-compose.yml`, `.github/workflows/`.

---

## 10. Verification

**Phase 0 done when:**
- `pnpm dev` brings up Next.js on :3000 and NestJS on :4000.
- All 10 screens render visually identical to the current Vite app at the new App Router routes.
- `docker-compose up` brings up Postgres + Redis; `pnpm --filter api prisma migrate dev` runs cleanly.
- CI passes (lint + typecheck + build).

**Phase 1 done when:**
- Register a user via `/register`; login via `/login`; hit `/me` and get profile back.
- Refresh works (kill access token, next call auto-refreshes).
- Google OAuth round-trip lands the user on `/onboarding` for first-time accounts.
- Hitting `/chat` without a token redirects to `/login`.

**Phase 2 done when:**
- Two browsers (different accounts) both pick a mood and get matched within 5s; both land in the same `/chat/[id]`.
- Sending a message from one shows it on the other in <500ms.
- Typing indicator + read receipt round-trip works.
- Page refresh restores conversation history from API.

**Phase 3 done when:**
- Friend request from chat header is received by peer in real time.
- Accept → both see "You're now friends!" system message; conversation now reachable from `/connections`.
- Block hides peer from match pool and disables chat send.

**Phase 4 done when:**
- Voice call between two browsers (one on home network, one tethered to LTE — forces TURN) completes for ≥30s with bidirectional audio.
- Mute and speaker toggles work.
- Hangup writes a `CallSession` row with correct `durationSec`.

**Phase 5 done when:**
- Sending a message with profanity is rejected (or flagged) + a `ModerationFlag` row exists.
- Report dialog creates a `Report` row.
- Notification bell shows unread count; clicking marks read.

**Phase 6 done when:**
- App is live at the production domain.
- Sentry dashboards show zero unhandled errors over 24h soak.
- Lighthouse desktop ≥90 perf/accessibility/best-practices on marketing pages.
- Smoke test script (Playwright) passes: register → onboard → match → chat → friend → call → block → report.

**Manual test plan (E2E, run before each deploy):**
1. Register two accounts in different browsers, complete onboarding.
2. Pick complementary moods, get matched, exchange 5 messages with typing + read receipts.
3. Send friend request, accept, verify reconnect from `/connections`.
4. Start a voice call, talk for 30s, hangup. Verify call duration in profile stats.
5. Block + report flows. Verify blocked user can't match with you.
6. Force token expiry (devtools), verify silent refresh.
7. Mobile viewport (DevTools 375px): full flow works with bottom nav.
8. Reduced motion + screen-reader pass: VoiceOver/NVDA reads chat + match + call announcements.
