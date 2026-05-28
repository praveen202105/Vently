# Deploying Vently

The monorepo ships to two providers:

- **Railway** — `apps/api` + Postgres + Redis.
- **Vercel** — `apps/web`.

These steps assume a clean Railway + Vercel account and the GitHub repo already
linked to both.

---

## 1. Railway: API + Postgres + Redis

1. Create a new Railway project from the GitHub repo.
2. Add three services:
   - **api** — build from Dockerfile at `apps/api/Dockerfile` (Railway auto-detects).
   - **postgres** — Railway plugin → Postgres 16.
   - **redis** — Railway plugin → Redis 7.
3. On the **api** service, set environment variables (copy from
   [apps/api/.env.example](apps/api/.env.example)):

   | Variable             | Value                                     |
   | -------------------- | ----------------------------------------- |
   | `DATABASE_URL`       | Reference: `${{ postgres.DATABASE_URL }}` |
   | `REDIS_URL`          | Reference: `${{ redis.REDIS_URL }}`       |
   | `JWT_ACCESS_SECRET`  | `openssl rand -hex 32`                    |
   | `JWT_REFRESH_SECRET` | `openssl rand -hex 32` (different value)  |
   | `JWT_ACCESS_TTL`     | `15m`                                     |
   | `JWT_REFRESH_TTL`    | `30d`                                     |
   | `CORS_ORIGIN`        | `https://<your-vercel-app>.vercel.app`    |
   | `COOKIE_DOMAIN`      | leave blank, or your custom domain        |
   | `NODE_ENV`           | `production`                              |
   | `LOG_LEVEL`          | `info`                                    |
   | `PORT`               | `4000` (Railway sets this automatically)  |
   | `TURN_PROVIDER`      | `cloudflare` or `metered`                 |
   | `TURN_API_KEY`       | provider API key                          |
   | `TURN_APP_ID`        | provider app/turn-key id                  |

4. The Dockerfile runs `prisma migrate deploy` on container start, so the
   first deploy applies all pending migrations.
5. Once the api is up, hit `https://<api-url>/health` — should return
   `{ status: "ok", checks: { postgres: "ok", redis: "ok" } }`.

### TURN provider (required for voice calls across NATs)

- **Cloudflare Calls** — Create an app at <https://dash.cloudflare.com/?to=/:account/calls/turn>.
  `TURN_API_KEY` is the bearer token, `TURN_APP_ID` is the TURN key id.
- **Metered.ca** — Create an app at <https://dashboard.metered.ca/>.
  `TURN_API_KEY` is the global API key, `TURN_APP_ID` is the subdomain
  (e.g. `myapp` for `myapp.metered.live`).

In dev without these set, the API falls back to public STUN, which works on
the same network but fails over cellular / strict NAT.

---

## 2. Vercel: Next.js web

1. Import the GitHub repo on Vercel.
2. Set root directory to `apps/web`.
3. Build command: leave default (`pnpm build` — Vercel detects pnpm via
   `packageManager` in root `package.json`).
4. Environment variables:

   | Variable                 | Value                           |
   | ------------------------ | ------------------------------- |
   | `NEXT_PUBLIC_API_URL`    | `https://<railway-api-url>/api` |
   | `NEXT_PUBLIC_SOCKET_URL` | `https://<railway-api-url>`     |

5. Once deployed, copy the Vercel URL back into Railway's `CORS_ORIGIN`
   variable and redeploy the api.

### Custom domain (optional)

1. Add the domain on Vercel under Settings → Domains.
2. On Railway, add the API as a subdomain (e.g. `api.vently.app`).
3. Update both `NEXT_PUBLIC_*` URLs + `CORS_ORIGIN` + `COOKIE_DOMAIN`
   (`.vently.app` so the refresh cookie works across subdomains).

---

## 3. CI / CD

- `.github/workflows/ci.yml` runs on every PR: lint, typecheck, prisma
  validate, build.
- `.github/workflows/deploy.yml` triggers a Railway CLI deploy after a
  merge to `main`. **Disabled by default** — flip `if: false` to `true`
  and add a `RAILWAY_TOKEN` secret to enable.
- Vercel's git integration deploys `apps/web` automatically on every push.

---

## 4. Smoke test the production deploy

1. Open `https://<vercel-url>/welcome` — animated background should run.
2. Register an account at `/register`.
3. Complete onboarding at `/onboarding`.
4. Pick a mood, get matched (open a second browser to test against).
5. Exchange messages — should be sub-500ms.
6. Save as friend → accept on the other side → reconnect from `/connections`.
7. Start a voice call (Phone icon in chat header). Both sides need to grant
   microphone permission.
8. From the chat header: try Report + Block flows.
9. Open the notification bell (DesktopSidebar) — see the friend-request
   notification.

If any step fails:

- Check Railway logs for the api service.
- Check Vercel deployment logs.
- Hit `/health` to verify Postgres + Redis are reachable.
- For WebRTC: open `chrome://webrtc-internals` — confirm a `relay` candidate
  appears once TURN is configured.

---

## 5. Observability (V1)

- Sentry: add `@sentry/nextjs` to `apps/web` and `@sentry/node` to
  `apps/api`; set `SENTRY_DSN` env vars. Initialise in `apps/web/instrumentation.ts`
  and `apps/api/src/main.ts`.
- Uptime: Railway has built-in uptime monitoring; UptimeRobot or BetterStack
  on `/health` works too.
- Metrics: `apps/api` pino logs are already structured JSON — pipe to
  Better Stack / Logtail / Datadog from Railway's log drain.
