# Vently

Anonymous emotional chat + voice calling. Turborepo monorepo: Next.js 15 web + NestJS 10 API.

See [VENTLY_PLAN.md](./VENTLY_PLAN.md) for the full architecture, [DEPLOY.md](./DEPLOY.md) for production deploy.

## What's inside

```
apps/
  web/                Next.js 15 (App Router, React 19) — Vercel
  api/                NestJS 10 + Prisma + Socket.io + WebRTC — Railway
packages/
  shared/             Prisma schema + Zod schemas + typed socket event contracts
  ui/                 Reusable React components (Button, GlassCard, AnimatedBackground)
  config/             tsconfig / eslint / tailwind preset shared across packages
```

## Features

End-to-end functional MVP:

- Email/password auth with rotating refresh tokens in httpOnly cookies.
- Anonymous profile (nickname + gender + bio + mood) with deterministic gradient avatars.
- 7-mood matchmaking over Redis sorted sets with atomic Lua-script pairing.
- Realtime text chat: optimistic send, typing indicator, read receipts.
- Friend requests + persistent connections that reconnect to the same conversation.
- WebRTC 1:1 voice calling with mute / speaker / hangup + managed TURN.
- Block + report + profanity filter (mild flags, severe rejects).
- In-app notifications with live bell badge over socket.

## Prerequisites

- Node.js 20+
- pnpm 9+ (enable via `corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker (for local Postgres + Redis)

## Quick start

```bash
pnpm install
docker compose up -d                                  # postgres + redis
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @vently/shared exec prisma generate     # generate Prisma client
pnpm --filter @vently/shared exec prisma migrate dev  # apply schema
pnpm dev                                              # web :3000, api :4000
```

Smoke test:

- Open `http://localhost:3000` — Splash → Welcome.
- Hit `http://localhost:4000/health` — `{ status: "ok", checks: { postgres, redis } }`.
- Register two accounts in two browsers and walk through onboarding → mood → match → chat.

## Common scripts

| Script            | What it does                                |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Run web (:3000) + api (:4000) in watch mode |
| `pnpm build`      | Production build for every workspace        |
| `pnpm typecheck`  | TypeScript across the workspace             |
| `pnpm lint`       | ESLint across the workspace                 |
| `pnpm db:migrate` | Apply Prisma migrations to local Postgres   |
| `pnpm db:studio`  | Open Prisma Studio                          |
| `pnpm format`     | Prettier write                              |

## Deploying

See [DEPLOY.md](./DEPLOY.md) — Railway (api + Postgres + Redis) + Vercel (web).

## Project state

All phases (0–6) of [VENTLY_PLAN.md §11](./VENTLY_PLAN.md) are implemented and pushed.
