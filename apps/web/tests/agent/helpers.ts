import { request, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

// Agent tests run against production by default but can be pointed elsewhere
// via E2E_WEB_URL / E2E_API_URL.
export const API_HOST = process.env.E2E_API_URL ?? 'https://api-production-7fe02.up.railway.app';
export const WEB_HOST = process.env.E2E_WEB_URL ?? 'https://vently-web-gamma.vercel.app';

const P = (path: string) => `/api${path}`;

export function uniqueEmail(prefix: string) {
  return `agent.${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function uniqueNickname(prefix: string) {
  // 3-20 chars, alphanumeric + underscores only (matches profile schema).
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface AgentUser {
  email: string;
  password: string;
  nickname: string;
  gender: 'MALE' | 'FEMALE';
  userId: string;
  accessToken: string;
}

/**
 * Provisions a fully-onboarded user via the REST API (faster + more reliable
 * than driving the UI for setup). Returns everything you need to drive the
 * web side from a browser context.
 */
export async function provisionAgent(args: {
  prefix: string;
  gender: 'MALE' | 'FEMALE';
  bio?: string;
}): Promise<AgentUser> {
  const email = uniqueEmail(args.prefix);
  const nickname = uniqueNickname(args.prefix);
  const password = 'AgentTest123';

  const ctx: APIRequestContext = await request.newContext({ baseURL: API_HOST });

  const regRes = await ctx.post(P('/auth/register'), { data: { email, password } });
  if (!regRes.ok()) {
    throw new Error(`[${args.prefix}] register failed: ${regRes.status()} ${await regRes.text()}`);
  }
  const reg = (await regRes.json()) as { accessToken: string; user: { id: string } };

  const profileRes = await ctx.put(P('/me/profile'), {
    data: { nickname, gender: args.gender, bio: args.bio, ageConfirmed: true, mood: null },
    headers: { Authorization: `Bearer ${reg.accessToken}` },
  });
  if (!profileRes.ok()) {
    throw new Error(
      `[${args.prefix}] profile upsert failed: ${profileRes.status()} ${await profileRes.text()}`,
    );
  }

  return {
    email,
    password,
    nickname,
    gender: args.gender,
    userId: reg.user.id,
    accessToken: reg.accessToken,
  };
}

/**
 * Logs an already-provisioned user into a fresh browser context. Sets the
 * refresh cookie (scoped to the api host) + seeds the access token. The auth
 * store hydrates from /me when AuthBootstrap runs on next page mount.
 */
export async function loginAgentIntoBrowser(
  ctx: BrowserContext,
  page: Page,
  user: AgentUser,
): Promise<void> {
  const apiCtx = await request.newContext({ baseURL: API_HOST });
  const loginRes = await apiCtx.post(P('/auth/login'), {
    data: { email: user.email, password: user.password },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `[${user.nickname}] login failed: ${loginRes.status()} ${await loginRes.text()}`,
    );
  }

  // Mirror the refresh cookie from the api domain so the browser includes it
  // on subsequent cross-site fetches.
  const cookies = (await apiCtx.storageState()).cookies;
  await ctx.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || new URL(API_HOST).hostname,
      path: c.path ?? '/',
      httpOnly: c.httpOnly,
      secure: c.secure ?? API_HOST.startsWith('https://'),
      sameSite: (c.sameSite as 'Lax' | 'Strict' | 'None') ?? 'None',
      expires: c.expires,
    })),
  );
}

/**
 * Small printer used in tests to make the console log read like a runbook.
 * Playwright's default reporter already prints test names; this adds the
 * "step-by-step" annotations.
 */
export function step(name: string) {
  // eslint-disable-next-line no-console
  console.log(`\n   ▸ ${name}`);
}
