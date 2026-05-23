import { test, expect, type BrowserContext } from '@playwright/test';
import { loginPage, provisionUserViaApi } from './helpers';

// Phase 2 + 3 — drives the full match-then-chat flow across two browser
// contexts so we exercise real Socket.io matchmaking + chat:send/receive +
// typing + friend request between two distinct users.

test.describe('Phase 2/3 — Match + Chat + Friend', () => {
  test('two users match, exchange messages, become friends', async ({ browser }) => {
    test.setTimeout(60_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    // Both users pick the same mood. networkidle ensures React hydration
    // finished before we drive clicks.
    await alice.goto('/mood', { waitUntil: 'networkidle' });
    await bob.goto('/mood', { waitUntil: 'networkidle' });

    await alice.getByRole('button', { name: /need to talk/i }).click();
    await alice.waitForURL(/\/matching/);

    await bob.getByRole('button', { name: /need to talk/i }).click();
    await bob.waitForURL(/\/matching/);

    // Both should land on chat in a few seconds.
    await alice.waitForURL(/\/chat\//, { timeout: 15_000 });
    await bob.waitForURL(/\/chat\//, { timeout: 15_000 });

    // Same conversation id on both sides.
    const aliceConvId = alice.url().split('/chat/')[1];
    const bobConvId = bob.url().split('/chat/')[1];
    expect(aliceConvId).toBeTruthy();
    expect(aliceConvId).toEqual(bobConvId);

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
    await alice.getByRole('button', { name: /save as friend/i }).click();
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
});
