# Multi-stage build for the NestJS API. Built from the monorepo root context
# so that workspace packages (@vently/shared, @vently/config) resolve.
#
# Build: docker build -f apps/api/Dockerfile -t vently-api .

# ─── Stage 1: install deps ───────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ──────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @vently/shared exec prisma generate
RUN pnpm --filter @vently/shared build
RUN pnpm --filter @vently/api build

# ─── Stage 3: runtime ────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/prisma ./packages/shared/prisma
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @vently/shared exec prisma migrate deploy && node dist/main.js"]
