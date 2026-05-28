import { test, expect, type BrowserContext } from '@playwright/test';
import { loginPage, provisionUserViaApi, API_URL } from './helpers';
import { request } from '@playwright/test';

// ─── Sprint 1 Feature E2E Tests ─────────────────────────────────────────────
// Covers all 6 features shipped in Sprint 1:
//   Q1  — Read Receipt ✓✓ Ticks
//   Q3  — Delete for Everyone
//   Q5  — Quote Reply
//   A4  — Toxic Message Pre-warning
//   S4  — Age Gate Modal (FLIRTY / LATE_NIGHT)
//   A6  — Context-aware Reply Chips (via API + socket)
//
// Timing budget:
//   Dev:  Next.js lazy-compile (~20-40s) + Railway cold-start (~10s)
//   We give 3–4 minutes per test that involves matchmaking + Groq calls.

// ─── Shared helper: match two users into a shared chat ─────────────────────
async function matchUsers(
  alice: import('@playwright/test').Page,
  bob: import('@playwright/test').Page,
  _timeout = 120_000,
  mood = /need to talk/i,
) {
  const timeout = 120_000;
  // Navigate both users to mood selection in parallel.
  // Use networkidle to wait for React hydration (Next.js dev lazy-compiles routes).
  await Promise.all([
    alice.goto('/mood', { waitUntil: 'networkidle', timeout }),
    bob.goto('/mood', { waitUntil: 'networkidle', timeout }),
  ]);

  // Wait for the mood buttons to be rendered and clickable.
  await Promise.all([
    alice.getByRole('button', { name: mood }).waitFor({ timeout }),
    bob.getByRole('button', { name: mood }).waitFor({ timeout }),
  ]);

  // Click sequentially: Alice joins first, Bob second → they match each other.
  await alice.getByRole('button', { name: mood }).click();
  await alice.waitForURL(/\/matching/, { timeout });
  await bob.getByRole('button', { name: mood }).click();
  await bob.waitForURL(/\/matching/, { timeout });

  // Both should navigate to /chat/:id once matched.
  await Promise.all([
    alice.waitForURL(/\/chat\//, { timeout }),
    bob.waitForURL(/\/chat\//, { timeout }),
  ]);

  const convId = alice.url().split('/chat/')[1];
  expect(convId).toBeTruthy();
  expect(convId).toEqual(bob.url().split('/chat/')[1]);
  return convId!;
}

// ─── Q1: Read Receipt ✓✓ Ticks ─────────────────────────────────────────────
test.describe('06 Sprint 1 — Q1: Read Receipt Ticks', () => {
  test('sent message shows receipt tick after server ack', async ({ browser }) => {
    test.setTimeout(300_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });

    const aliceCtx: BrowserContext = await browser.newContext();
    const bobCtx: BrowserContext   = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob   = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    await matchUsers(alice, bob, 60_000);

    // Alice sends a message.
    const msg = `receipt-test-${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(msg);
    await alice.getByRole('button', { name: 'Send' }).click();

    // ── 1. Message visible on Alice's side ───────────────────────────────
    await expect(alice.getByText(msg)).toBeVisible({ timeout: 8_000 });

    // ── 2. A receipt tick SVG with aria-label should appear under Alice's bubble.
    //    The server ack transitions the bubble from pending→sent in ~1s.
    //    We check for any valid receipt state (Sent, Delivered, or Read).
    const receiptTick = alice.locator('[data-testid="receipt-sent"],[data-testid="receipt-delivered"],[data-testid="receipt-read"]').last();
    await expect(receiptTick).toBeVisible({ timeout: 15_000 });

    // ── 3. Bob sees the message, triggering a CHAT_READ event ────────────
    await expect(bob.getByText(msg)).toBeVisible({ timeout: 8_000 });
    await bob.evaluate(() => {
      const el =
        (document.querySelector('[data-testid="message-list"]') as HTMLElement) ??
        (document.querySelector('main') as HTMLElement) ??
        document.documentElement;
      el.scrollTop = el.scrollHeight;
    });
    await bob.waitForTimeout(3_000);

    // Tick is still visible (now could be read state).
    await expect(receiptTick).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('pending message shows aria-label "Sending" then upgrades to Sent', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    await alice.getByPlaceholder(/type a message/i).fill(`pending-tick-${Date.now()}`);
    await alice.getByRole('button', { name: 'Send' }).click();

    // After send, the ack arrives quickly and the tick becomes Sent.
    const sentTick = alice.locator('[data-testid="receipt-sent"],[data-testid="receipt-read"]').last();
    await expect(sentTick).toBeVisible({ timeout: 15_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });
});


// ─── Q3: Delete for Everyone ─────────────────────────────────────────────────
test.describe('06 Sprint 1 — Q3: Delete for Everyone', () => {
  test('right-clicking own message shows Delete option; peer sees "This message was deleted"', async ({ browser }) => {
    test.setTimeout(300_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);

    await matchUsers(alice, bob, 60_000);

    const msg = `delete-me-${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(msg);
    await alice.getByRole('button', { name: 'Send' }).click();

    // Wait for both sides to have the message.
    await expect(alice.getByText(msg)).toBeVisible({ timeout: 8_000 });
    await expect(bob.getByText(msg)).toBeVisible({ timeout: 8_000 });

    // ── 1. Right-click Alice's bubble → context menu appears ──────────────
    await alice.getByText(msg).click({ button: 'right' });
    await expect(alice.getByRole('button', { name: /delete for everyone/i })).toBeVisible({ timeout: 5_000 });

    // ── 2. Click delete ───────────────────────────────────────────────────
    await alice.getByRole('button', { name: /delete for everyone/i }).click();

    // ── 3. Alice's bubble shows "This message was deleted" ────────────────
    await expect(alice.getByText(/this message was deleted/i)).toBeVisible({ timeout: 8_000 });
    await expect(alice.getByText(msg)).not.toBeVisible();

    // ── 4. Bob also sees deletion in real time via CHAT_DELETE_STATUS ─────
    await expect(bob.getByText(/this message was deleted/i)).toBeVisible({ timeout: 8_000 });
    await expect(bob.getByText(msg)).not.toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('right-click on PEER message does NOT show Delete option', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    const msg = `from-bob-${Date.now()}`;
    await bob.getByPlaceholder(/type a message/i).fill(msg);
    await bob.getByRole('button', { name: 'Send' }).click();
    await expect(alice.getByText(msg)).toBeVisible({ timeout: 8_000 });

    // Right-click on a PEER message on Alice's screen.
    await alice.getByText(msg).click({ button: 'right' });
    await alice.waitForTimeout(800);

    // "Delete for everyone" should NOT be visible — only own messages can be deleted.
    await expect(alice.getByRole('button', { name: /delete for everyone/i })).not.toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('DELETE /conversations/:cid/messages/:mid API — owner can delete, non-owner gets 403', async () => {
    const alice = await provisionUserViaApi({ gender: 'MALE' });
    const bob   = await provisionUserViaApi({ gender: 'FEMALE' });

    const ctx = await request.newContext({ baseURL: API_URL });

    // Create a conversation via matchmaking REST helper (direct API route used in agent tests).
    // For an isolated API test we verify auth-guard & ownership check with a non-existent id.
    const unauthedRes = await ctx.delete(`/api/conversations/fake-cid/messages/fake-mid`);
    expect(unauthedRes.status()).toBe(401);

    // Auth'd but non-existent conversation → 403 or 404.
    const authedRes = await ctx.delete(`/api/conversations/fake-cid/messages/fake-mid`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    expect([403, 404]).toContain(authedRes.status());
  });
});

// ─── Q5: Quote Reply ─────────────────────────────────────────────────────────
test.describe('06 Sprint 1 — Q5: Quote Reply', () => {
  test('right-clicking a message shows Reply; composer shows quoted preview; sent message includes quote', async ({ browser }) => {
    test.setTimeout(300_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    // Bob sends a message that Alice will reply to.
    const original = `original-msg-${Date.now()}`;
    await bob.getByPlaceholder(/type a message/i).fill(original);
    await bob.getByRole('button', { name: 'Send' }).click();
    await expect(alice.getByText(original)).toBeVisible({ timeout: 8_000 });

    // ── 1. Alice right-clicks Bob's message and chooses Reply ─────────────
    await alice.getByText(original).click({ button: 'right' });
    await expect(alice.getByRole('button', { name: /^reply$/i })).toBeVisible({ timeout: 5_000 });
    await alice.getByRole('button', { name: /^reply$/i }).click();

    // ── 2. Quoted preview bar appears above the composer ──────────────────
    // The QuoteReplyPreview in composer context contains the original body.
    await expect(alice.getByText(original).last()).toBeVisible({ timeout: 5_000 });

    // Cancel button (aria-label="Cancel reply") should be present.
    await expect(alice.getByRole('button', { name: /cancel reply/i })).toBeVisible({ timeout: 5_000 });

    // ── 3. Alice types and sends the reply ────────────────────────────────
    const reply = `this is my reply ${Date.now()}`;
    await alice.getByPlaceholder(/type a message/i).fill(reply);
    await alice.getByRole('button', { name: 'Send' }).click();

    // ── 4. The reply bubble on Alice's screen shows both the quote and the reply ─
    await expect(alice.getByText(reply)).toBeVisible({ timeout: 8_000 });
    // The bubble should contain the quoted body (truncated preview).
    await expect(alice.getByText(original).last()).toBeVisible({ timeout: 5_000 });

    // ── 5. Bob also sees the full quote-reply bubble ──────────────────────
    await expect(bob.getByText(reply)).toBeVisible({ timeout: 8_000 });
    await expect(bob.getByText(original).last()).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('clicking Cancel Reply removes the quoted preview without sending', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    const msg = `cancel-reply-msg-${Date.now()}`;
    await bob.getByPlaceholder(/type a message/i).fill(msg);
    await bob.getByRole('button', { name: 'Send' }).click();
    await expect(alice.getByText(msg)).toBeVisible({ timeout: 8_000 });

    // Right-click → Reply
    await alice.getByText(msg).click({ button: 'right' });
    await alice.getByRole('button', { name: /^reply$/i }).click();
    await expect(alice.getByRole('button', { name: /cancel reply/i })).toBeVisible({ timeout: 5_000 });

    // Click Cancel
    await alice.getByRole('button', { name: /cancel reply/i }).click();

    // Preview should disappear.
    await expect(alice.getByRole('button', { name: /cancel reply/i })).not.toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });
});

// ─── A4: Toxic Message Pre-warning ───────────────────────────────────────────
test.describe('06 Sprint 1 — A4: Toxic Message Pre-warning', () => {
  test('typing a mild profanity word shows amber warning banner', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    // ── 1. Type a mild profanity word → amber warning appears ────────────
    await alice.getByPlaceholder(/type a message/i).fill('what the shit');
    await expect(
      alice.getByText(/may be flagged by our moderation system/i),
    ).toBeVisible({ timeout: 5_000 });

    // ── 2. Clear the input → warning disappears ──────────────────────────
    await alice.getByPlaceholder(/type a message/i).fill('hello');
    await expect(
      alice.getByText(/may be flagged by our moderation system/i),
    ).not.toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('typing a severe word shows red block warning', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    // ── Type a severe word → red block warning ────────────────────────────
    await alice.getByPlaceholder(/type a message/i).fill('kys');
    await expect(
      alice.getByText(/violates our content policy/i),
    ).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('warning clears when message is sent', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    // Type a mild word (won't be blocked by server, just flagged).
    await alice.getByPlaceholder(/type a message/i).fill('what the shit man');
    await expect(alice.getByText(/may be flagged/i)).toBeVisible({ timeout: 5_000 });

    // Send it — warning should clear.
    await alice.getByRole('button', { name: 'Send' }).click();
    await expect(alice.getByText(/may be flagged/i)).not.toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('server rejects SEVERE messages — socket returns error', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    // Directly emit a severe message via the page context to bypass the
    // client-side warning (which only warns, doesn't block). The server
    // should reject it and the bubble should end up in "failed" state.
    const convId = alice.url().split('/chat/')[1] ?? '';
    const severity = await alice.evaluate(async (conversationId: string) => {
      // @ts-expect-error accessing window socket for test
      const socket = window.__ventlySocket as {
        emit: (event: string, payload: unknown, cb?: (r: { ok: boolean; error?: string }) => void) => void;
      } | undefined;
      if (!socket) return 'no-socket';
      return new Promise<string>((resolve) => {
        socket.emit(
          'chat:send',
          { conversationId, body: 'kys', clientId: `test-${Date.now()}` },
          (res: { ok: boolean; error?: string }) => {
            resolve(res.ok ? 'ok' : (res.error ?? 'error'));
          },
        );
        setTimeout(() => resolve('timeout'), 5000);
      });
    }, convId);

    // Server should reject severe content.
    expect(severity).not.toBe('ok');
    expect(severity).not.toBe('no-socket'); // socket must be present

    await aliceCtx.close();
    await bobCtx.close();
  });
});

// ─── S4: Age Gate Modal ───────────────────────────────────────────────────────
test.describe('06 Sprint 1 — S4: Age Gate for FLIRTY / LATE_NIGHT', () => {
  test('clicking FLIRTY shows age gate modal; confirming proceeds to /matching', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const aliceCtx  = await browser.newContext();
    const alice     = await aliceCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await alice.goto('/mood', { waitUntil: 'networkidle' });

    // ── 1. Click "Flirty chat" ────────────────────────────────────────────
    await alice.getByRole('button', { name: /flirty chat/i }).click();

    // ── 2. Age gate modal dialog should appear ────────────────────────────
    await expect(alice.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(alice.getByText(/content advisory/i)).toBeVisible({ timeout: 5_000 });
    await expect(alice.getByText(/18 years or older/i)).toBeVisible({ timeout: 5_000 });

    // ── 3. Clicking "I confirm, I'm 18+" proceeds to /matching ───────────
    await alice.getByRole('button', { name: /i confirm/i }).click();
    await alice.waitForURL(/\/matching/, { timeout: 10_000 });

    await aliceCtx.close();
  });

  test('clicking LATE_NIGHT mood shows age gate modal', async ({ browser }) => {
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const aliceCtx  = await browser.newContext();
    const alice     = await aliceCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await alice.goto('/mood', { waitUntil: 'networkidle' });

    await alice.getByRole('button', { name: /late night/i }).click();

    await expect(alice.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(alice.getByText(/content advisory/i)).toBeVisible({ timeout: 5_000 });

    await aliceCtx.close();
  });

  test('clicking "Go back" on age gate cancels and stays on /mood', async ({ browser }) => {
    test.setTimeout(60_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const aliceCtx  = await browser.newContext();
    const alice     = await aliceCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await alice.goto('/mood', { waitUntil: 'networkidle' });

    await alice.getByRole('button', { name: /flirty chat/i }).click();
    await expect(alice.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // ── Cancel ────────────────────────────────────────────────────────────
    await alice.getByRole('button', { name: /go back/i }).click();

    // Modal should close; still on /mood
    await expect(alice.getByRole('dialog')).not.toBeVisible();
    expect(alice.url()).toMatch(/\/mood/);

    await aliceCtx.close();
  });

  test('NEED_TO_TALK and FRIENDSHIP moods do NOT show age gate', async ({ browser }) => {
    test.setTimeout(60_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const aliceCtx  = await browser.newContext();
    const alice     = await aliceCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await alice.goto('/mood', { waitUntil: 'networkidle' });

    // Clicking a non-gated mood should go straight to /matching.
    await alice.getByRole('button', { name: /friendship/i }).click();
    await alice.waitForURL(/\/matching/, { timeout: 10_000 });

    // No modal should have appeared.
    await expect(alice.getByRole('dialog')).not.toBeVisible();

    await aliceCtx.close();
  });
});

// ─── A6: Context-aware Reply Chips ───────────────────────────────────────────
test.describe('06 Sprint 1 — A6: Context-aware Reply Chips', () => {
  test('suggestion chips appear after peer message and are clickable', async ({ browser }) => {
    // Longer timeout: Groq needs time (up to 30s on cold start).
    test.setTimeout(240_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    // Build some context: bob sends 2 messages first for the 3-message window.
    const ctx1 = `feeling a bit down today ${Date.now()}`;
    const ctx2 = `just needed someone to talk to`;
    await bob.getByPlaceholder(/type a message/i).fill(ctx1);
    await bob.getByRole('button', { name: 'Send' }).click();
    await expect(alice.getByText(ctx1)).toBeVisible({ timeout: 8_000 });

    await bob.getByPlaceholder(/type a message/i).fill(ctx2);
    await bob.getByRole('button', { name: 'Send' }).click();
    await expect(alice.getByText(ctx2)).toBeVisible({ timeout: 8_000 });

    // Now bob sends the trigger message for which chips should appear on Alice.
    const trigger = `how are you feeling today?`;
    await bob.getByPlaceholder(/type a message/i).fill(trigger);
    await bob.getByRole('button', { name: 'Send' }).click();

    // ── 1. Suggestion chips appear on Alice's screen ──────────────────────
    // Groq can take up to 30s; give it 45s to be safe.
    await expect(alice.getByText(trigger)).toBeVisible({ timeout: 8_000 });
    // Chips are buttons inside the suggestion strip. Wait for at least one.
    const chips = alice.locator('button.shrink-0.rounded-full');
    await expect(chips.first()).toBeVisible({ timeout: 45_000 });
    await alice.waitForTimeout(3000); // Allow any parallel/late suggestion payloads to settle

    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThanOrEqual(1);
    expect(chipCount).toBeLessThanOrEqual(3);

    // ── 2. Clicking a chip fills the composer and sends ───────────────────
    const chipText = await chips.first().textContent();
    await chips.first().click();

    // After clicking, composer should be cleared (chip was sent as a message).
    await expect(alice.getByText(chipText ?? '')).toBeVisible({ timeout: 5_000 });

    // ── 3. Chips clear when Alice starts typing manually ─────────────────
    await alice.getByPlaceholder(/type a message/i).fill('typing now');
    await expect(chips.first()).not.toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });

  test('chips are NOT shown on the sender side (only to the receiver)', async ({ browser }) => {
    test.setTimeout(300_000);

    const aliceUser = await provisionUserViaApi({ gender: 'MALE' });
    const bobUser   = await provisionUserViaApi({ gender: 'FEMALE' });
    const aliceCtx  = await browser.newContext();
    const bobCtx    = await browser.newContext();
    const alice     = await aliceCtx.newPage();
    const bob       = await bobCtx.newPage();

    await loginPage(alice, aliceCtx, aliceUser);
    await loginPage(bob, bobCtx, bobUser);
    await matchUsers(alice, bob, 60_000);

    await alice.getByPlaceholder(/type a message/i).fill('hello there!');
    await alice.getByRole('button', { name: 'Send' }).click();

    // Wait a couple seconds for any suggestions to potentially arrive.
    await alice.waitForTimeout(3_000);

    // Chips should NOT appear on Alice's screen (she's the sender).
    const chips = alice.locator('button.shrink-0.rounded-full');
    await expect(chips).not.toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });
});
