# Vently

Anonymous emotional chat + voice calling app. Turborepo monorepo (Next.js 15 + NestJS).

See [VENTLY_PLAN.md](./VENTLY_PLAN.md) for the full architecture, phased roadmap, and verification plan.

## Workspaces

```
apps/
  web/                Next.js 15 (App Router) — Vercel
  api/                NestJS 10 + Prisma + Socket.io — Railway
packages/
  shared/             Prisma schema + Zod schemas + socket event types
  ui/                 Shared React component library (shadcn + custom)
  config/             tsconfig / eslint / prettier / tailwind preset
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local Postgres + Redis)

## Quick start

```bash
pnpm install
docker compose up -d                # postgres + redis on :5432 / :6379
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                     # apply Prisma migrations
pnpm dev                            # web on :3000, api on :4000
```

## Common scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run all apps in dev mode |
| `pnpm build` | Build everything |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | ESLint across the workspace |
| `pnpm db:migrate` | Apply Prisma migrations to local Postgres |
| `pnpm db:studio` | Open Prisma Studio |

## Phased roadmap

See [VENTLY_PLAN.md §6](./VENTLY_PLAN.md). Currently in **Phase 0 — Foundation**.
# Vently
