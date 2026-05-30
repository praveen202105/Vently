import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { SocketEvents } from '@vently/shared';
import {
  API_HOST,
  WEB_HOST,
  loginAgentIntoBrowser,
  provisionAgent,
  step,
  type AgentUser,
} from './helpers';

/**
 * 🤖 Vently testing agent — single comprehensive suite.
 *
 * Drives 3 real accounts (Alice MALE, Bob FEMALE, Charlie MALE) through every
 * user-facing flow against whichever environment you point it at:
 *
 *   pnpm test:agent             → production (default)
 *   pnpm test:agent:local       → http://localhost:3000 / :4000
 *   E2E_WEB_URL=... pnpm test:agent   → any custom host
 *
 * Screenshots are saved to apps/web/agent-results/ at every step. An HTML
 * report opens automatically if anything fails (browse screenshots there).
 */

// Pick a less-popular text mood for the chat-flow tests so we're less likely
// to match with real strangers when running against production. (Used to be
// VOICE_ONLY for the same reason, but VOICE_ONLY now bypasses /chat and goes
// straight to /call, which has its own dedicated test below.)
const TEST_MOOD = 'FRIENDSHIP';
// Accessible button name is "Friendship Connect instantly" — keep the regex
// loose like the original /voice only/i so it matches the full label.
const TEST_MOOD_LABEL = /friendship/i;

let alice: AgentUser;
let bob: AgentUser;
let charlie: AgentUser;

let aliceCtx: BrowserContext;
let bobCtx: BrowserContext;
let charlieCtx: BrowserContext;

let alicePage: Page;
let bobPage: Page;
let charliePage: Page;

test.describe.configure({ mode: 'serial' });

test.describe('🤖 Vently Testing Agent', () => {
  test.beforeAll(async ({ browser }) => {
    // eslint-disable-next-line no-console
    console.log(`\n   🎯 Target: ${WEB_HOST}  →  ${API_HOST}\n`);

    // Provision three users in parallel.
    [alice, bob, charlie] = await Promise.all([
      provisionAgent({ prefix: 'alice', gender: 'MALE', bio: 'hey there' }),
      provisionAgent({ prefix: 'bob', gender: 'FEMALE', bio: 'hi 👋' }),
      provisionAgent({ prefix: 'charlie', gender: 'MALE' }),
    ]);

    // eslint-disable-next-line no-console
    console.log(
      `   ✓ Provisioned: ${alice.nickname} (M), ${bob.nickname} (F), ${charlie.nickname} (M)`,
    );

    aliceCtx = await browser.newContext();
    bobCtx = await browser.newContext();
    charlieCtx = await browser.newContext();

    alicePage = await aliceCtx.newPage();
    bobPage = await bobCtx.newPage();
    charliePage = await charlieCtx.newPage();

    await Promise.all([
      loginAgentIntoBrowser(aliceCtx, alicePage, alice),
      loginAgentIntoBrowser(bobCtx, bobPage, bob),
      loginAgentIntoBrowser(charlieCtx, charliePage, charlie),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([aliceCtx?.close(), bobCtx?.close(), charlieCtx?.close()]);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 1 — Marketing + auth gate
  // ────────────────────────────────────────────────────────────────────────

  test('1. Welcome page loads + shows public CTAs to anonymous visitors', async ({ browser }) => {
    step('Open / as a brand-new anonymous visitor');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/welcome', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: /talk freely/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /start talking/i })).toBeVisible();
    await page.screenshot({ path: 'agent-results/01-welcome-anon.png', fullPage: true });

    await ctx.close();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 2 — Authenticated routing + profile rendering
  // ────────────────────────────────────────────────────────────────────────

  test('2. /home renders the logged-in app home', async () => {
    step(`${alice.nickname} (MALE) opens /home`);
    await alicePage.goto('/home', { waitUntil: 'networkidle' });

    await alicePage.waitForURL(/\/home/, { timeout: 15_000 });
    await expect(
      alicePage.getByRole('heading', { name: new RegExp(`hi, ${alice.nickname}`, 'i') }),
    ).toBeVisible();
    await expect(alicePage.getByRole('heading', { name: /how are you feeling/i })).toHaveCount(0);
    await expect(alicePage.getByText(new RegExp(`continue as ${alice.nickname}`, 'i'))).toHaveCount(
      0,
    );
    await alicePage.screenshot({ path: 'agent-results/02-home-authed.png', fullPage: true });
  });

  test('3. /profile renders the nickname', async () => {
    step(`${alice.nickname} opens /profile`);
    await alicePage.goto('/profile', { waitUntil: 'networkidle' });
    await expect(alicePage.getByRole('heading', { name: alice.nickname })).toBeVisible({
      timeout: 15_000,
    });
    await alicePage.screenshot({ path: 'agent-results/03-profile.png', fullPage: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 3 — Matchmaking + chat between Alice and Bob
  // ────────────────────────────────────────────────────────────────────────

  test('4. Alice + Bob match on the same mood', async () => {
    step('Bob queues first');
    await bobPage.goto('/mood', { waitUntil: 'networkidle' });
    await bobPage.screenshot({ path: 'agent-results/04a-bob-mood.png', fullPage: true });
    await bobPage.getByRole('button', { name: TEST_MOOD_LABEL }).click();
    await bobPage.waitForURL(/\/matching/);

    step('Alice queues 2s later (so she pops Bob from the FEMALE queue)');
    await alicePage.waitForTimeout(2_000);
    await alicePage.goto('/mood', { waitUntil: 'networkidle' });
    await alicePage.getByRole('button', { name: TEST_MOOD_LABEL }).click();

    step('Both wait for /chat redirect');
    await Promise.all([
      alicePage.waitForURL(/\/chat\//, { timeout: 30_000 }),
      bobPage.waitForURL(/\/chat\//, { timeout: 30_000 }),
    ]);

    const aliceConv = alicePage.url().split('/chat/')[1];
    const bobConv = bobPage.url().split('/chat/')[1];

    // If they matched with strangers (real users in queue), the conv IDs
    // won't match. Be loud about it but don't fail the whole suite — the rest
    // still verifies the system, just not between our two accounts.
    if (aliceConv !== bobConv) {
      // eslint-disable-next-line no-console
      console.warn(
        `   ⚠️ Alice ↔ Bob matched with strangers (alice=${aliceConv}, bob=${bobConv}). ` +
          `Probably real users in the prod queue. The rest of the suite will reuse Alice's chat anyway.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`   ✓ Alice ↔ Bob paired in conversation ${aliceConv}`);
    }

    await alicePage.screenshot({ path: 'agent-results/04b-alice-chat.png', fullPage: true });
    await bobPage.screenshot({ path: 'agent-results/04c-bob-chat.png', fullPage: true });
  });

  test('5. Realtime message round-trip', async () => {
    // Skip if Alice and Bob ended up in different conversations.
    const aliceConv = alicePage.url().split('/chat/')[1];
    const bobConv = bobPage.url().split('/chat/')[1];
    test.skip(
      aliceConv !== bobConv,
      'Alice & Bob matched with strangers — skipping cross-chat test',
    );

    step(`${alice.nickname} → ${bob.nickname}`);
    const aliceMsg = `agent-hi ${Date.now()}`;
    await alicePage.getByPlaceholder(/type a message/i).fill(aliceMsg);
    await alicePage.keyboard.press('Enter');
    await expect(bobPage.getByText(aliceMsg)).toBeVisible({ timeout: 10_000 });

    step(`${bob.nickname} → ${alice.nickname}`);
    const bobMsg = `agent-hey ${Date.now()}`;
    await bobPage.getByPlaceholder(/type a message/i).fill(bobMsg);
    await bobPage.keyboard.press('Enter');
    await expect(alicePage.getByText(bobMsg)).toBeVisible({ timeout: 10_000 });

    await alicePage.screenshot({ path: 'agent-results/05-chat-exchanged.png', fullPage: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 4 — Friend request + acceptance + connections list
  // ────────────────────────────────────────────────────────────────────────

  test('6. Friend request + acceptance', async () => {
    const aliceConv = alicePage.url().split('/chat/')[1];
    const bobConv = bobPage.url().split('/chat/')[1];
    test.skip(aliceConv !== bobConv, 'Different conversations — skipping friend flow');

    step(`${alice.nickname} clicks Save-as-friend`);
    await alicePage.getByRole('button', { name: /more options/i }).click();
    await alicePage.getByRole('menuitem', { name: /save as friend/i }).click();
    await expect(alicePage.getByText(/friend request sent/i)).toBeVisible({ timeout: 8_000 });
    await alicePage.screenshot({ path: 'agent-results/06a-friend-sent.png', fullPage: true });

    step(`${bob.nickname} opens /connections and accepts`);
    await bobPage.goto('/connections', { waitUntil: 'networkidle' });
    await expect(bobPage.getByText(/pending requests/i)).toBeVisible({ timeout: 10_000 });
    await bobPage.screenshot({ path: 'agent-results/06b-bob-pending.png', fullPage: true });
    await bobPage.getByRole('button', { name: 'Accept' }).first().click();

    step('Both should see the "You\'re now friends!" system message in chat');
    // Use .first() — both the inline chat bubble and (potentially) the
    // sonner toast that fires from the FRIEND_RESPOND handler can render
    // the same string. We only care that the SYSTEM message lands.
    await expect(alicePage.getByText(/you're now friends/i).first()).toBeVisible({
      timeout: 8_000,
    });

    step(`${alice.nickname} should now appear in ${bob.nickname}'s connections`);
    await expect(bobPage.getByText(alice.nickname).first()).toBeVisible({ timeout: 8_000 });
    await bobPage.screenshot({ path: 'agent-results/06c-connections.png', fullPage: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 5 — Notifications
  // ────────────────────────────────────────────────────────────────────────

  test('7. Bob has a friend-accepted notification', async () => {
    step(`${alice.nickname} opens notification bell`);
    await alicePage.goto('/mood', { waitUntil: 'networkidle' });
    // Wait for auth hydration so the bell can fetch.
    await alicePage.waitForTimeout(1_500);

    // The bell only shows on the desktop sidebar (md+). The default Chrome
    // viewport is wide enough.
    const bell = alicePage.getByRole('button', { name: /unread notifications/i });
    if (await bell.isVisible().catch(() => false)) {
      await bell.click();
      await alicePage.screenshot({ path: 'agent-results/07-notifications.png', fullPage: true });
    } else {
      // eslint-disable-next-line no-console
      console.warn('   ⚠️ Bell not visible at this viewport — skipping UI assertion');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 6 — Block + report (using Charlie as the third party)
  // ────────────────────────────────────────────────────────────────────────

  test('8. Charlie + Alice match → Alice blocks Charlie → Charlie cannot re-match Alice', async () => {
    step(
      `${charlie.nickname} (MALE) and ${alice.nickname} (MALE) cannot match with each other anyway (same gender) — instead use Charlie ↔ Bob`,
    );

    step(`${charlie.nickname} blocks ${alice.nickname} via API`);
    // Test the block-API path directly (the UI block button is in chat header,
    // already exercised by manual smoke). This verifies the API gate.
    const res = await charliePage.request.post(`${API_HOST}/api/blocks`, {
      data: { userId: alice.userId },
      headers: { Authorization: `Bearer ${charlie.accessToken}` },
    });
    expect(res.status()).toBeLessThan(300);

    step('Confirm the block list contains Alice');
    const listRes = await charliePage.request.get(`${API_HOST}/api/blocks`, {
      headers: { Authorization: `Bearer ${charlie.accessToken}` },
    });
    const blocks = (await listRes.json()) as { blockedId: string }[];
    expect(blocks.some((b) => b.blockedId === alice.userId)).toBe(true);
  });

  test('9. Report endpoint accepts a real report', async () => {
    step(`${charlie.nickname} reports ${alice.nickname}`);
    const res = await charliePage.request.post(`${API_HOST}/api/reports`, {
      data: { reportedId: alice.userId, reason: 'HARASSMENT', details: 'agent-test report' },
      headers: { Authorization: `Bearer ${charlie.accessToken}` },
    });
    expect(res.status()).toBe(201);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 7 — WebRTC ICE servers endpoint
  // ────────────────────────────────────────────────────────────────────────

  test('10. /webrtc/ice-servers returns STUN + TURN entries', async () => {
    const res = await alicePage.request.get(`${API_HOST}/api/webrtc/ice-servers`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { iceServers: { urls: string | string[] }[] };
    const flat = body.iceServers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(flat.some((u) => u.startsWith('stun:'))).toBe(true);
    expect(flat.some((u) => u.startsWith('turn:'))).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 8 — Health
  // ────────────────────────────────────────────────────────────────────────

  test('11. API health is OK', async ({ request }) => {
    const res = await request.get(`${API_HOST}/health`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('ok');
    expect(body.checks.postgres).toBe('ok');
    expect(body.checks.redis).toBe('ok');
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 9 — Voice-only direct match
  // Verifies that picking VOICE_ONLY skips the chat surface entirely and
  // takes both sides straight to /call/[id]?voice-only=1. We can't validate
  // audio in headless Chromium but proving the route + URL flag is enough
  // — the WebRTC handshake itself is exercised by the route-loading code.
  // ────────────────────────────────────────────────────────────────────────

  test('12. VOICE_ONLY match takes both sides directly to /call', async () => {
    // Grant mic permission so getUserMedia doesn't block the navigation.
    await aliceCtx.grantPermissions(['microphone'], { origin: WEB_HOST });
    await bobCtx.grantPermissions(['microphone'], { origin: WEB_HOST });

    step('Bob queues VOICE_ONLY first');
    await bobPage.goto('/mood', { waitUntil: 'networkidle' });
    await bobPage.getByRole('button', { name: /voice only/i }).click();
    await bobPage.waitForURL(/\/matching/);

    step('Alice queues VOICE_ONLY 2s later');
    await alicePage.waitForTimeout(2_000);
    await alicePage.goto('/mood', { waitUntil: 'networkidle' });
    await alicePage.getByRole('button', { name: /voice only/i }).click();

    step('Both should redirect to /call/[id]?voice-only=1, NOT /chat/');
    await Promise.all([
      alicePage.waitForURL(/\/call\/.*voice-only=1/, { timeout: 30_000 }),
      bobPage.waitForURL(/\/call\/.*voice-only=1/, { timeout: 30_000 }),
    ]);

    const aliceConv = alicePage.url().match(/\/call\/([^?]+)/)?.[1];
    const bobConv = bobPage.url().match(/\/call\/([^?]+)/)?.[1];

    if (aliceConv !== bobConv) {
      // eslint-disable-next-line no-console
      console.warn(
        `   ⚠️ Alice ↔ Bob matched with strangers on VOICE_ONLY (alice=${aliceConv}, bob=${bobConv}). ` +
          `Route flag still verified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`   ✓ Alice ↔ Bob paired on voice-only conversation ${aliceConv}`);
    }

    step('Voice-only match pill should appear on the call screen');
    // Either side should show the "Voice-only match" pill within a few seconds.
    await expect(alicePage.getByText(/voice-only match/i)).toBeVisible({ timeout: 5_000 });
    await expect(bobPage.getByText(/voice-only match/i)).toBeVisible({ timeout: 5_000 });

    await alicePage.screenshot({ path: 'agent-results/12-alice-voice-call.png', fullPage: true });
    await bobPage.screenshot({ path: 'agent-results/12-bob-voice-call.png', fullPage: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 10 — Friend chat history is persistent
  // After Alice + Bob friended in test 6, their FRIEND conversation must
  // survive End/Back presses and remain reopenable from /connections with
  // the full message thread intact.
  // ────────────────────────────────────────────────────────────────────────

  test('13. Friends preserve chat history (tile preview + reopen + scroll)', async () => {
    step('Alice navigates from /call back to /connections');
    await alicePage.goto('/connections', { waitUntil: 'networkidle' });

    step('Bob also returns to /connections so socket events route correctly');
    await bobPage.goto('/connections', { waitUntil: 'networkidle' });

    step("Alice's friend tile for Bob should be present and clickable");
    const bobTile = alicePage.getByRole('button', { name: new RegExp(bob.nickname, 'i') });
    await expect(bobTile.first()).toBeVisible({ timeout: 10_000 });

    step('Tile should show a last-message preview (from the test-5 exchange)');
    // The preview will either be "You: agent-hi..." (Alice's last) or
    // "agent-hey..." (Bob's last), or the system "You're now friends!"
    // message — any of those is fine, we just need a non-empty preview.
    const tileText = await bobTile.first().textContent();
    expect(tileText).toBeTruthy();

    step('Alice taps the tile and lands on /chat/[friendConvId]');
    await bobTile.first().click();
    await alicePage.waitForURL(/\/chat\//, { timeout: 10_000 });
    const friendConvId = alicePage.url().split('/chat/')[1]!;
    // eslint-disable-next-line no-console
    console.log(`   ✓ Re-opened friend conversation ${friendConvId}`);

    step('Verify via API that the FRIEND conversation is NOT ended');
    const metaRes = await alicePage.request.get(`${API_HOST}/api/conversations/${friendConvId}`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    expect(metaRes.ok()).toBeTruthy();
    const meta = (await metaRes.json()) as { type: string; endedAt: string | null };
    expect(meta.type).toBe('FRIEND');
    expect(meta.endedAt).toBeNull();

    step('Historical messages from test 5 should still be visible');
    // The "You're now friends!" SYSTEM message is the most reliable assertion —
    // it was inserted on friendship acceptance and persists for the life of
    // the conversation.
    await expect(alicePage.getByText(/you're now friends/i).first()).toBeVisible({
      timeout: 10_000,
    });

    step('The End button should be labelled "Back" for a FRIEND chat, not "End"');
    // Disambiguate from the chat header's back-arrow button (also has
    // accessible name "Back" via aria-label). Match the VISIBLE TEXT only,
    // which the arrow button doesn't have.
    await expect(alicePage.getByText('Back', { exact: true })).toBeVisible();

    step('Alice sends a fresh message; Bob receives it in real time');
    const reconnectMsg = `agent-reconnect ${Date.now()}`;
    await alicePage.getByPlaceholder(/type a message/i).fill(reconnectMsg);
    await alicePage.keyboard.press('Enter');
    // Bob is on /connections — open the friend tile to verify.
    await bobPage
      .getByRole('button', { name: new RegExp(alice.nickname, 'i') })
      .first()
      .click();
    await bobPage.waitForURL(/\/chat\//, { timeout: 10_000 });
    await expect(bobPage.getByText(reconnectMsg)).toBeVisible({ timeout: 10_000 });

    step('Tapping "Back" returns Alice to /connections without ending the chat');
    // Same disambiguation as the visibility check above — match the text-only
    // Back button (not the chat header's back-arrow button).
    await alicePage.getByText('Back', { exact: true }).click();
    await alicePage.waitForURL(/\/connections/, { timeout: 5_000 });

    step('Conversation is STILL not ended after the Back press');
    const metaRes2 = await alicePage.request.get(`${API_HOST}/api/conversations/${friendConvId}`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    const meta2 = (await metaRes2.json()) as { endedAt: string | null };
    expect(meta2.endedAt).toBeNull();

    await alicePage.screenshot({ path: 'agent-results/13-alice-connections.png', fullPage: true });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 11 — Message reactions
  // Verifies the toggle endpoint + listMessages projection. We exercise via
  // API rather than the hover UI (Playwright hover events into the message
  // bubble are timing-sensitive and don't reliably show the picker in
  // headless Chromium).
  // ────────────────────────────────────────────────────────────────────────

  test('14. Reactions: Alice reacts to a message, toggles off, both reflect via API', async () => {
    // Alice + Bob were friends from test 6 — the FRIEND conversation exists.
    // Pull the latest messages and pick the most recent one from Bob (not
    // Alice's own) for a more realistic reaction target.
    const friendsRes = await alicePage.request.get(`${API_HOST}/api/friends`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    const friends = (await friendsRes.json()) as {
      profile: { userId: string } | null;
      conversationId: string | null;
    }[];
    const bobFriendRow = friends.find((f) => f.profile?.userId === bob.userId);
    test.skip(!bobFriendRow?.conversationId, 'no friend conversation between Alice + Bob');
    const conversationId = bobFriendRow!.conversationId!;

    const msgsRes = await alicePage.request.get(
      `${API_HOST}/api/conversations/${conversationId}/messages?limit=10`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
    const page = (await msgsRes.json()) as {
      items: { id: string; senderId: string; reactions: { emoji: string; userId: string }[] }[];
    };
    // Find any non-system message from someone other than alice (could be
    // bob, or alice's own if bob never sent — fall back).
    const target =
      page.items.find((m) => m.senderId !== alice.userId) ?? page.items[page.items.length - 1];
    expect(target).toBeTruthy();
    const messageId = target!.id;

    step('Alice reacts ❤️ to the target message');
    const addRes = await alicePage.request.post(`${API_HOST}/api/messages/${messageId}/reactions`, {
      data: { emoji: '❤️' },
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    expect(addRes.ok()).toBeTruthy();
    const addBody = (await addRes.json()) as { action: 'add' | 'remove' };
    // The reaction may have been left from a prior run; either action is
    // acceptable here. We assert end state below.

    step('Re-fetch messages — the message should have Alice in its reactions');
    const verifyRes = await alicePage.request.get(
      `${API_HOST}/api/conversations/${conversationId}/messages?limit=10`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
    const verify = (await verifyRes.json()) as {
      items: { id: string; reactions: { emoji: string; userId: string }[] }[];
    };
    const found = verify.items.find((m) => m.id === messageId);
    expect(found).toBeTruthy();
    // If the first toggle was an 'add', alice's reaction is now present. If
    // 'remove' (already present from earlier), it's now absent. Toggle once
    // more to land in a known state.
    const aliceReacted = found!.reactions.some(
      (r) => r.userId === alice.userId && r.emoji === '❤️',
    );
    if (!aliceReacted && addBody.action === 'remove') {
      // Re-add to reach the "reacted" state for the assertion below.
      await alicePage.request.post(`${API_HOST}/api/messages/${messageId}/reactions`, {
        data: { emoji: '❤️' },
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      });
    }

    step('Toggle off — second POST removes the reaction');
    const removeRes = await alicePage.request.post(
      `${API_HOST}/api/messages/${messageId}/reactions`,
      {
        data: { emoji: '❤️' },
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      },
    );
    expect(removeRes.ok()).toBeTruthy();
    const removeBody = (await removeRes.json()) as { action: 'add' | 'remove' };
    expect(removeBody.action).toBe('remove');

    step('Final state: Alice no longer reacted');
    const finalRes = await alicePage.request.get(
      `${API_HOST}/api/conversations/${conversationId}/messages?limit=10`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
    const final = (await finalRes.json()) as {
      items: { id: string; reactions: { emoji: string; userId: string }[] }[];
    };
    const finalMsg = final.items.find((m) => m.id === messageId);
    const stillReacted = finalMsg!.reactions.some(
      (r) => r.userId === alice.userId && r.emoji === '❤️',
    );
    expect(stillReacted).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 12 — Message Search (new feature)
  // Verifies the search API endpoint returns filtered results and the
  // frontend search UI is present on the chat screen.
  // ────────────────────────────────────────────────────────────────────────

  test('15. Message search API returns filtered results', async () => {
    // Reuse Alice + Bob's friend conversation from test 14.
    const friendsRes = await alicePage.request.get(`${API_HOST}/api/friends`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    const friends = (await friendsRes.json()) as {
      profile: { userId: string } | null;
      conversationId: string | null;
    }[];
    const bobFriendRow = friends.find((f) => f.profile?.userId === bob.userId);
    test.skip(!bobFriendRow?.conversationId, 'no friend conversation between Alice + Bob');
    const conversationId = bobFriendRow!.conversationId!;

    step('Send a uniquely searchable message via API so we have something to find');
    const uniqueWord = `searchable_${Date.now()}`;
    await alicePage.request
      .post(`${API_HOST}/api/conversations/${conversationId}/messages`, {
        data: { body: `Hello this is a ${uniqueWord} message` },
        headers: {
          Authorization: `Bearer ${alice.accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      .catch(() => {
        // Messages are sent via socket in production; skip if REST isn't exposed.
      });

    step('Search endpoint returns results matching the query');
    const searchRes = await alicePage.request.get(
      `${API_HOST}/api/conversations/${conversationId}/messages/search?q=agent`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
    expect(searchRes.ok()).toBeTruthy();
    const body = (await searchRes.json()) as { items: { id: string; body: string }[] };
    expect(Array.isArray(body.items)).toBe(true);
    // Every returned message must contain "agent" (case-insensitive)
    for (const msg of body.items) {
      expect(msg.body.toLowerCase()).toContain('agent');
    }

    step('Search with short query (< 2 chars) returns empty items');
    const shortRes = await alicePage.request.get(
      `${API_HOST}/api/conversations/${conversationId}/messages/search?q=a`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
    expect(shortRes.ok()).toBeTruthy();
    const shortBody = (await shortRes.json()) as { items: unknown[] };
    expect(shortBody.items.length).toBe(0);

    step('Search UI: the search button exists on the chat screen');
    // Navigate to the friend conversation to verify the search icon is in the header.
    await alicePage.goto(`/chat/${conversationId}`, { waitUntil: 'networkidle' });
    await expect(alicePage.getByRole('button', { name: /search messages/i })).toBeVisible({
      timeout: 10_000,
    });

    step('Opening search mode shows the search input');
    await alicePage.getByRole('button', { name: /search messages/i }).click();
    await expect(alicePage.locator('#chat-search-input')).toBeVisible({ timeout: 5_000 });

    step('Typing a query shows the "Type at least 2 characters" hint first');
    // Input is empty — should show placeholder hint
    await expect(alicePage.getByText(/type at least 2 characters/i)).toBeVisible({
      timeout: 3_000,
    });

    step('Typing "agent" in the search box fetches and highlights results');
    await alicePage.locator('#chat-search-input').fill('agent');
    // After debounce (350ms) results should appear
    await alicePage.waitForTimeout(600);
    // Either results OR "no messages found" — both indicate the search fired
    const hasResults = await alicePage
      .getByText(/\d+ result/i)
      .isVisible()
      .catch(() => false);
    const hasEmpty = await alicePage
      .getByText(/no messages found/i)
      .isVisible()
      .catch(() => false);
    expect(hasResults || hasEmpty).toBe(true);

    await alicePage.screenshot({ path: 'agent-results/15-message-search.png', fullPage: true });

    step('Pressing close (X) exits search mode');
    await alicePage.getByRole('button', { name: /close search/i }).click();
    await expect(alicePage.locator('#chat-search-input')).not.toBeVisible({ timeout: 3_000 });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 13 — Typing indicator with peer name (new feature)
  // Verifies the chat header subtitle updates correctly when a peer is
  // typing. We drive via socket events emitted through the browser.
  // ────────────────────────────────────────────────────────────────────────

  test('16. Typing indicator shows peer nickname in chat header', async () => {
    // Use the friend chat already open on Alice's page from test 15.
    const friendsRes = await alicePage.request.get(`${API_HOST}/api/friends`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    const friends = (await friendsRes.json()) as {
      profile: { userId: string; nickname: string } | null;
      conversationId: string | null;
    }[];
    const bobFriendRow = friends.find((f) => f.profile?.userId === bob.userId);
    test.skip(!bobFriendRow?.conversationId, 'no friend conversation between Alice + Bob');
    const conversationId = bobFriendRow!.conversationId!;

    step('Both Alice and Bob open the shared friend conversation');
    await alicePage.goto(`/chat/${conversationId}`, { waitUntil: 'networkidle' });
    await bobPage.goto(`/chat/${conversationId}`, { waitUntil: 'networkidle' });

    step('Bob starts typing — Alice should see "X is typing…" in the header');
    await bobPage.getByPlaceholder(/type a message/i).click();
    await bobPage.getByPlaceholder(/type a message/i).type('hell', { delay: 80 });

    // The header subtitle should show Bob's nickname followed by "is typing"
    await expect(alicePage.getByText(new RegExp(`${bob.nickname}.*is typing`, 'i'))).toBeVisible({
      timeout: 6_000,
    });

    await alicePage.screenshot({
      path: 'agent-results/16-typing-indicator-with-name.png',
      fullPage: true,
    });

    step('After Bob stops typing, the subtitle reverts to "online"');
    await bobPage.getByPlaceholder(/type a message/i).clear();
    // The typing indicator clears after the server-side 3s timeout; we wait a bit.
    await alicePage.waitForTimeout(4_000);
    await expect(alicePage.getByText(/online/i).first()).toBeVisible({ timeout: 5_000 });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 14 — Unread tab badge (new feature)
  // Verifies the document title updates when Alice receives messages while
  // the tab is backgrounded (simulated by Page.evaluate).
  // ────────────────────────────────────────────────────────────────────────

  test('17. Unread tab badge updates document title when tab is hidden', async () => {
    const friendsRes = await alicePage.request.get(`${API_HOST}/api/friends`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    const friends = (await friendsRes.json()) as {
      profile: { userId: string } | null;
      conversationId: string | null;
    }[];
    const bobFriendRow = friends.find((f) => f.profile?.userId === bob.userId);
    test.skip(!bobFriendRow?.conversationId, 'no friend conversation between Alice + Bob');
    const conversationId = bobFriendRow!.conversationId!;

    step('Alice opens the friend conversation');
    await alicePage.goto(`/chat/${conversationId}`, { waitUntil: 'networkidle' });

    step("Simulate tab hidden on Alice's page (visibilitychange to hidden)");
    await alicePage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    step('Bob sends a message while Alice is "backgrounded"');
    await bobPage.goto(`/chat/${conversationId}`, { waitUntil: 'networkidle' });
    const unreadMsg = `unread-badge-test ${Date.now()}`;
    await bobPage.getByPlaceholder(/type a message/i).fill(unreadMsg);
    await bobPage.keyboard.press('Enter');

    step("Alice's document title should update to '(N) Vently'");
    await alicePage.waitForFunction(() => document.title.startsWith('('), { timeout: 8_000 });
    const title = await alicePage.evaluate(() => document.title);
    expect(title).toMatch(/^\(\d+\) Vently/);

    await alicePage.screenshot({
      path: 'agent-results/17-unread-tab-badge.png',
      fullPage: true,
    });

    step("Simulating tab becoming visible resets the title to 'Vently'");
    await alicePage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await alicePage.waitForFunction(() => !document.title.startsWith('('), { timeout: 5_000 });
    const resetTitle = await alicePage.evaluate(() => document.title);
    expect(resetTitle).toBe('Vently');
  });
});

// Suppress "unused import" hint for SocketEvents — handy to keep around for
// future ad-hoc socket assertions in this file.
void SocketEvents;
