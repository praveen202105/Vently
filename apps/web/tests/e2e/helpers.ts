import type { BrowserContext, Page } from '@playwright/test';
import { request } from '@playwright/test';

// Note: Playwright's baseURL drops the path component when resolving against
// absolute paths starting with `/`. So we keep API_URL as the host and prefix
// every endpoint with /api/... inline.
export const API_HOST = process.env.E2E_API_URL ?? 'http://localhost:4000';
export const API_URL = API_HOST;
const P = (path: string) => `/api${path}`;

export function uniqueEmail(prefix = 'tester') {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function uniqueNickname(prefix = 'tester') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface OnboardedUser {
  email: string;
  password: string;
  nickname: string;
  userId: string;
  accessToken: string;
}

/**
 * Provisions a user via the REST API (faster + more reliable than driving the
 * onboarding form for setup). Returns the tokens + ids for later assertions.
 */
export async function provisionUserViaApi(
  args: {
    email?: string;
    password?: string;
    nickname?: string;
    gender?: 'MALE' | 'FEMALE';
  } = {},
): Promise<OnboardedUser & { cookies: string }> {
  const email = args.email ?? uniqueEmail();
  const password = args.password ?? 'Password123';
  const nickname = args.nickname ?? uniqueNickname();
  const gender = args.gender ?? 'MALE';

  const ctx = await request.newContext({ baseURL: API_URL });

  const regRes = await ctx.post(P('/auth/register'), { data: { email, password } });
  if (!regRes.ok()) throw new Error(`register failed: ${regRes.status()} ${await regRes.text()}`);
  const reg = (await regRes.json()) as {
    accessToken: string;
    user: { id: string };
  };

  // The refresh cookie is set on the request-context — capture it for browser handoff.
  const cookies = await ctx.storageState();
  const refreshCookie = cookies.cookies.find((c) => c.name === 'vently_refresh');
  const cookieHeader = refreshCookie
    ? `${refreshCookie.name}=${refreshCookie.value}`
    : '';

  const profileRes = await ctx.put(P('/me/profile'), {
    data: { nickname, gender, ageConfirmed: true, mood: null },
    headers: { Authorization: `Bearer ${reg.accessToken}` },
  });
  if (!profileRes.ok()) {
    throw new Error(`profile upsert failed: ${profileRes.status()} ${await profileRes.text()}`);
  }

  return {
    email,
    password,
    nickname,
    userId: reg.user.id,
    accessToken: reg.accessToken,
    cookies: cookieHeader,
  };
}

/**
 * Logs an already-provisioned user into a Playwright page by hitting the
 * login endpoint, storing the refresh cookie, and seeding the access token
 * into Zustand via a small page.evaluate.
 */
export async function loginPage(page: Page, ctx: BrowserContext, user: { email: string; password: string }) {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const loginRes = await apiCtx.post(P('/auth/login'), {
    data: { email: user.email, password: user.password },
  });
  if (!loginRes.ok()) throw new Error(`login failed: ${loginRes.status()} ${await loginRes.text()}`);
  const login = (await loginRes.json()) as { accessToken: string };

  const cookies = (await apiCtx.storageState()).cookies;
  await ctx.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: 'localhost',
      path: c.path ?? '/',
      httpOnly: c.httpOnly,
      secure: false,
      sameSite: (c.sameSite as 'Lax' | 'Strict' | 'None') ?? 'Lax',
      expires: c.expires,
    })),
  );

  await page.addInitScript((token) => {
    // The auth store hydrates from /me on mount, but we set the token here so
    // the first protected request goes out authenticated.
    window.localStorage.setItem('vently:bootstrap-token', token);
  }, login.accessToken);

  return login.accessToken;
}
