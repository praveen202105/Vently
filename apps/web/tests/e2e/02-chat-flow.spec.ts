import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginPage, provisionUserViaApi } from './helpers';

async function openChatOptions(page: Page) {
  await page.getByRole('button', { name: /more options/i }).click();
}

const MATCH_TIMEOUT = 180_000;

async function waitForAppUrl(page: Page, pattern: RegExp, timeout = MATCH_TIMEOUT) {
  await expect.poll(() => page.url(), { timeout }).toMatch(pattern);
}

async function pickNeedToTalk(page: Page) {
  if (/\/(matching|chat)\//.test(page.url()) || page.url().includes('/matching')) return;

  const button = page.getByRole('button', { name: /need to talk/i });
  await expect(button).toBeVisible({ timeout: MATCH_TIMEOUT });

  // In Next dev, hydration can occasionally lag behind the visible button.
  // Retry the click if the first event was swallowed before React attached.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await button.click();
    try {
      await waitForAppUrl(page, /\/matching|\/chat\//, 5_000);
      return;
    } catch {
      // Try again below, then let the final wait surface the real timeout.
    }
  }

  await waitForAppUrl(page, /\/matching/);
}

async function matchNeedToTalk(alice: Page, bob: Page) {
  await Promise.all([
    alice.goto('/mood', { waitUntil: 'networkidle', timeout: MATCH_TIMEOUT }),
    bob.goto('/mood', { waitUntil: 'networkidle', timeout: MATCH_TIMEOUT }),
  ]);

  await pickNeedToTalk(alice);
  await pickNeedToTalk(bob);

  await Promise.all([waitForAppUrl(alice, /\/chat\//), waitForAppUrl(bob, /\/chat\//)]);

  const aliceConvId = alice.url().split('/chat/')[1];
  const bobConvId = bob.url().split('/chat/')[1];
  expect(aliceConvId).toBeTruthy();
  expect(aliceConvId).toEqual(bobConvId);
  return aliceConvId!;
}

// Phase 2 + 3 — drives the full match-then-chat flow across two browser
// contexts so we exercise real Socket.io matchmaking + chat:send/receive +
// typing + friend request between two distinct users.

test.describe('Phase 2/3 — Match + Chat + Friend', () => {
  test('two users match, exchange messages, become friends', async ({ browser }) => {
    test.setTimeout(360_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    await matchNeedToTalk(alice, bob);

    await expect(alice.getByTestId('chat-peer-name')).toBeVisible();
    await expect(alice.getByTestId('chat-peer-status')).toHaveText(/online|typing|offline|—/i);
    await expect(alice.getByRole('button', { name: /start voice call/i })).toBeVisible();
    await expect(alice.getByRole('button', { name: /start video call/i })).toBeVisible();
    await expect(alice.getByRole('button', { name: /report user/i })).toHaveCount(0);
    await expect(alice.getByRole('button', { name: /block user/i })).toHaveCount(0);
    await openChatOptions(alice);
    await expect(alice.getByRole('menuitem', { name: /save as friend/i })).toBeVisible();
    await expect(alice.getByRole('menuitem', { name: /report user/i })).toBeVisible();
    await expect(alice.getByRole('menuitem', { name: /block user/i })).toBeVisible();
    await expect(alice.getByRole('menuitem', { name: /end chat/i })).toBeVisible();
    await alice.keyboard.press('Escape');

    // Send a message from alice, see it on bob.
    const aliceMsg = `hi from alice ${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(aliceMsg);
    await alice.getByRole('button', { name: 'Send' }).click();

    await expect(bob.getByText(aliceMsg)).toBeVisible({ timeout: 5_000 });

    // And the reverse.
    const bobMsg = `hello back from bob ${Date.now()}`;
    await bob.getByPlaceholder(/type a message/i).fill(bobMsg);
    await bob.getByRole('button', { name: 'Send' }).click();

    await expect(alice.getByText(bobMsg)).toBeVisible({ timeout: 5_000 });

    // Alice sends a friend request.
    await openChatOptions(alice);
    await alice.getByRole('menuitem', { name: /save as friend/i }).click();
    // Toast appears.
    await expect(alice.getByText(/friend request sent/i)).toBeVisible({ timeout: 5_000 });

    // Bob accepts it from connections.
    await bob.goto('/connections', { waitUntil: 'networkidle' });
    await expect(bob.getByText(/pending requests/i)).toBeVisible({ timeout: 5_000 });
    await bob.getByRole('button', { name: 'Accept' }).first().click();

    // After accept, alice should see the system message in chat.
    await expect(alice.getByText(/you're now friends/i)).toBeVisible({ timeout: 5_000 });

    // Bob's connections page now shows alice as a friend.
    await expect(bob.getByText(aliceUser.nickname)).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('two strangers match, leave conversation, match again and see reunion banner', async ({
    browser,
  }) => {
    test.setTimeout(360_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    // Initial match
    await matchNeedToTalk(alice, bob);

    // Send at least one message so the conversation has content and gets ended
    const aliceMsg = `hello stranger ${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(aliceMsg);
    await alice.getByRole('button', { name: 'Send' }).click();
    await expect(bob.getByText(aliceMsg)).toBeVisible({ timeout: 5_000 });

    // Alice ends the chat
    await openChatOptions(alice);
    await alice.getByRole('menuitem', { name: /end chat/i }).click();
    await alice.getByRole('button', { name: 'End chat' }).click();
    await waitForAppUrl(alice, /\/mood/);

    // Bob redirects to connections because chat ended
    await waitForAppUrl(bob, /\/connections/, 10_000);

    // Re-match to trigger reunion
    await matchNeedToTalk(alice, bob);

    // Assert that the reunion banner is visible on both screens
    await expect(alice.getByText(/you two met before/i)).toBeVisible({ timeout: 10_000 });
    await expect(bob.getByText(/you two met before/i)).toBeVisible({ timeout: 10_000 });

    // Dismiss the banner on Alice's screen
    await alice.getByRole('button', { name: /dismiss banner/i }).click();
    await expect(alice.getByText(/you two met before/i)).not.toBeVisible();

    // Verify Bob's page refresh keeps the banner (REST endpoint retrieval)
    await bob.reload({ waitUntil: 'networkidle' });
    await expect(bob.getByText(/you two met before/i)).toBeVisible({ timeout: 10_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });
});
