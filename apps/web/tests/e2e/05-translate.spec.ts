import { test, expect, type BrowserContext } from '@playwright/test';
import { loginPage, provisionUserViaApi, API_HOST } from './helpers';
import { request } from '@playwright/test';

// ─── Translate Feature E2E ──────────────────────────────────────────────────
// Tests the Auto-Detect Language + Translate Chips feature end-to-end.
// Two users match, one sends a message, the other clicks Translate, and we
// verify the translated text appears + "Show original" toggle works.

test.describe('05 — Translate Chips', () => {
  test('peer message shows Translate button; clicking translates and shows localized chips', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    // Both users pick the same mood and match (using 'need to talk' —
    // same pattern as 02-chat-flow.spec.ts which is proven to work).
    await alice.goto('/mood', { waitUntil: 'domcontentloaded' });
    await bob.goto('/mood', { waitUntil: 'domcontentloaded' });

    // Wait for auth hydration — the mood buttons only appear after /me resolves.
    await alice.getByRole('button', { name: /need to talk/i }).waitFor({ timeout: 15_000 });
    await alice.getByRole('button', { name: /need to talk/i }).click();
    await alice.waitForURL(/\/matching/);
    await bob.getByRole('button', { name: /need to talk/i }).waitFor({ timeout: 15_000 });
    await bob.getByRole('button', { name: /need to talk/i }).click();
    await bob.waitForURL(/\/matching/);

    await alice.waitForURL(/\/chat\//, { timeout: 15_000 });
    await bob.waitForURL(/\/chat\//, { timeout: 15_000 });

    const convId = alice.url().split('/chat/')[1];
    expect(convId).toBeTruthy();
    const bobConvId = bob.url().split('/chat/')[1];
    expect(convId).toEqual(bobConvId);

    // Alice sends a Spanish message (simulates a foreign-language peer).
    const spanishMsg = '¡Hola amigo! ¿Cómo estás hoy?';
    await alice.getByPlaceholder(/type a message/i).fill(spanishMsg);
    await alice.getByRole('button', { name: 'Send' }).click();

    // Bob should receive it.
    await expect(bob.getByText(spanishMsg)).toBeVisible({ timeout: 8_000 });

    // ── 1. Translate button is visible on the peer bubble ──────────────────
    const translateBtn = bob.getByTestId('translate-btn').first();
    await expect(translateBtn).toBeVisible({ timeout: 5_000 });

    // ── 2. Click Translate — spinner appears, then translated text ──────────
    await translateBtn.click();

    // The translated text container should appear (data-testid="translated-text")
    const translatedText = bob.getByTestId('translated-text').first();
    await expect(translatedText).toBeVisible({ timeout: 20_000 }); // Groq call

    // Translated text should NOT equal the original Spanish text.
    const translatedContent = await translatedText.textContent();
    expect(translatedContent).not.toBeNull();
    expect(translatedContent?.trim()).not.toBe('');
    // Should not be the original Spanish.
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
    // Should appear immediately since it's cached.
    await expect(bob.getByTestId('translated-text').first()).toBeVisible({ timeout: 3_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('translate button is NOT shown on own messages', async ({ browser }) => {
    test.setTimeout(60_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    await alice.goto('/mood', { waitUntil: 'domcontentloaded' });
    await bob.goto('/mood', { waitUntil: 'domcontentloaded' });

    // Wait for auth hydration before clicking mood buttons.
    await alice.getByRole('button', { name: /need to talk/i }).waitFor({ timeout: 15_000 });
    await alice.getByRole('button', { name: /need to talk/i }).click();
    await alice.waitForURL(/\/matching/);
    await bob.getByRole('button', { name: /need to talk/i }).waitFor({ timeout: 15_000 });
    await bob.getByRole('button', { name: /need to talk/i }).click();
    await bob.waitForURL(/\/matching/);

    await alice.waitForURL(/\/chat\//, { timeout: 15_000 });
    await bob.waitForURL(/\/chat\//, { timeout: 15_000 });

    // Alice sends a message — on Alice's own screen it should have NO translate button.
    const msg = `Hello from alice ${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(msg);
    await alice.getByRole('button', { name: 'Send' }).click();

    await expect(alice.getByText(msg)).toBeVisible({ timeout: 5_000 });

    // Translate button should NOT appear on the sender's own bubble.
    // Wait a moment for any buttons that would appear.
    await alice.waitForTimeout(1_000);
    await expect(alice.getByTestId('translate-btn')).not.toBeVisible();

    // But it SHOULD appear on Bob's screen (it's a peer message for Bob).
    await expect(bob.getByText(msg)).toBeVisible({ timeout: 5_000 });
    await expect(bob.getByTestId('translate-btn').first()).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('translate REST endpoint returns expected shape', async () => {
    // Direct API test — validates the endpoint is auth-guarded and
    // returns the right error status for invalid params.
    const apiCtx = await request.newContext({ baseURL: API_HOST });

    const alice = await provisionUserViaApi({ gender: 'MALE' });

    // Unauthenticated request must be rejected.
    const unauthedRes = await apiCtx.post(
      `/api/conversations/fake-conv-id/messages/fake-msg-id/translate`,
      { data: { targetLocale: 'en' } },
    );
    expect(unauthedRes.status()).toBe(401);

    // Authenticated request with a non-existent conversation should be 403/404.
    const authedRes = await apiCtx.post(
      `/api/conversations/fake-conv-id/messages/fake-msg-id/translate`,
      {
        data: { targetLocale: 'en' },
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      },
    );
    // assertParticipant throws ForbiddenException or NotFoundException.
    expect([403, 404]).toContain(authedRes.status());
  });
});

