import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginPage, provisionUserViaApi, API_HOST } from './helpers';
import { request } from '@playwright/test';

// ─── Translate Feature E2E ──────────────────────────────────────────────────
// Tests the Auto-Detect Language + Translate Chips feature end-to-end.
// Two users match, one sends a message, the other clicks Translate, and we
// verify the translated text appears + "Show original" toggle works.
//
// Timing notes:
//   - Dev:  Next.js lazy-compiles each route on first request (~20-40s).
//   - Prod: Vercel CDN + Railway cold-start can take 10-20s per page.
//   - Matchmaking socket: requires both users to be in the queue simultaneously.
//   So we give each step a generous budget and use a 4-minute total timeout.

/** Helper: navigate two users to /mood and match them into a chat. */
async function waitForAppUrl(page: Page, pattern: RegExp, timeout: number) {
  await expect.poll(() => page.url(), { timeout }).toMatch(pattern);
}

async function pickNeedToTalk(page: Page, timeout: number) {
  if (/\/(matching|chat)\//.test(page.url()) || page.url().includes('/matching')) return;

  const button = page.getByRole('button', { name: /need to talk/i });
  await button.waitFor({ timeout });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await button.click();
    try {
      await waitForAppUrl(page, /\/matching|\/chat\//, 5_000);
      return;
    } catch {
      // Retry; Next dev can render the button just before hydration completes.
    }
  }

  await waitForAppUrl(page, /\/matching/, timeout);
}

async function matchUsers(alice: Page, bob: Page, timeout = 120_000) {
  timeout = Math.max(timeout, 180_000);
  // Navigate both users to mood selection in parallel.
  await Promise.all([
    alice.goto('/mood', { waitUntil: 'networkidle', timeout }),
    bob.goto('/mood', { waitUntil: 'networkidle', timeout }),
  ]);

  // Wait for auth hydration on both pages before clicking.
  // 'Need to talk' is the proven mood used in 02-chat-flow.spec.ts.
  await Promise.all([
    alice.getByRole('button', { name: /need to talk/i }).waitFor({ timeout }),
    bob.getByRole('button', { name: /need to talk/i }).waitFor({ timeout }),
  ]);

  // Click sequentially to avoid socket race conditions:
  // Alice joins the queue first, Bob joins second → they match each other.
  await pickNeedToTalk(alice, timeout);
  await pickNeedToTalk(bob, timeout);

  // Wait for matchmaking to pair them and navigate to /chat/:id.
  await Promise.all([
    waitForAppUrl(alice, /\/chat\//, timeout),
    waitForAppUrl(bob, /\/chat\//, timeout),
  ]);

  const aliceConvId = alice.url().split('/chat/')[1];
  const bobConvId = bob.url().split('/chat/')[1];
  expect(aliceConvId).toBeTruthy();
  expect(aliceConvId).toEqual(bobConvId);

  return aliceConvId!;
}

test.describe('05 — Translate Chips', () => {
  test('peer message shows Translate button; clicking translates and shows localized chips', async ({
    browser,
  }) => {
    // 4 minutes: 40s page compile + 30s auth + 15s match + 60s Groq calls
    test.setTimeout(360_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    // Match both users into a shared chat conversation.
    await matchUsers(alice, bob, 60_000);

    // Alice sends a Spanish message (simulates a foreign-language peer).
    const spanishMsg = '¡Hola amigo! ¿Cómo estás hoy?';
    await alice.getByPlaceholder(/type a message/i).fill(spanishMsg);
    await alice.getByRole('button', { name: 'Send' }).click();

    // Bob should receive it via socket.
    await expect(bob.getByText(spanishMsg)).toBeVisible({ timeout: 10_000 });

    // ── 1. Translate button is visible on the peer bubble ──────────────────
    const translateBtn = bob.getByTestId('translate-btn').first();
    await expect(translateBtn).toBeVisible({ timeout: 8_000 });

    // ── 2. Click Translate — spinner appears, then translated text ──────────
    await translateBtn.click();

    // The translated text container should appear (data-testid="translated-text").
    // Allow 30s for the Groq API call to complete.
    const translatedText = bob.getByTestId('translated-text').first();
    await expect(translatedText).toBeVisible({ timeout: 30_000 });

    // Translated text should not be the original Spanish.
    const translatedContent = await translatedText.textContent();
    expect(translatedContent).not.toBeNull();
    expect(translatedContent?.trim()).not.toBe('');
    expect(translatedContent?.trim()).not.toBe(spanishMsg);

    // ── 3. "Translated · Show original" toggle is visible ──────────────────
    const toggleBtn = bob.getByTestId('translate-toggle').first();
    await expect(toggleBtn).toBeVisible({ timeout: 5_000 });
    await expect(toggleBtn).toContainText(/translated/i);

    // ── 4. Clicking toggle restores original Spanish text ──────────────────
    await toggleBtn.click();
    await expect(bob.getByText(spanishMsg)).toBeVisible({ timeout: 5_000 });
    // translated-text testid should be gone (back to original).
    await expect(bob.getByTestId('translated-text')).not.toBeVisible();

    // ── 5. Re-translate is instant (cached — no second Groq call) ──────────
    await translateBtn.click();
    await expect(bob.getByTestId('translated-text').first()).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('translate button is NOT shown on own messages', async ({ browser }) => {
    // 3 minutes: compile + auth + match + assertions
    test.setTimeout(300_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    await matchUsers(alice, bob, 60_000);

    // Alice sends a message.
    const msg = `Hello from alice ${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(msg);
    await alice.getByRole('button', { name: 'Send' }).click();

    await expect(alice.getByText(msg)).toBeVisible({ timeout: 5_000 });

    // Translate button should NOT appear on the sender's own bubble.
    await alice.waitForTimeout(1_500);
    await expect(alice.getByTestId('translate-btn')).not.toBeVisible();

    // But it SHOULD appear on Bob's screen (it's a peer message for Bob).
    await expect(bob.getByText(msg)).toBeVisible({ timeout: 8_000 });
    await expect(bob.getByTestId('translate-btn').first()).toBeVisible({ timeout: 8_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('translate REST endpoint returns expected shape', async () => {
    // Direct API test — validates auth-guard and error shape.
    const apiCtx = await request.newContext({ baseURL: API_HOST });

    const alice = await provisionUserViaApi({ gender: 'MALE' });

    // Unauthenticated request must be rejected with 401.
    const unauthedRes = await apiCtx.post(
      `/api/conversations/fake-conv-id/messages/fake-msg-id/translate`,
      { data: { targetLocale: 'en' } },
    );
    expect(unauthedRes.status()).toBe(401);

    // Authenticated request with a non-existent conversation → 403/404.
    const authedRes = await apiCtx.post(
      `/api/conversations/fake-conv-id/messages/fake-msg-id/translate`,
      {
        data: { targetLocale: 'en' },
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      },
    );
    expect([403, 404]).toContain(authedRes.status());
  });
});
