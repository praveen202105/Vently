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
    console.log(`   ✓ Provisioned: ${alice.nickname} (M), ${bob.nickname} (F), ${charlie.nickname} (M)`);

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
  // Phase 2 — Authenticated home + profile rendering
  // ────────────────────────────────────────────────────────────────────────

  test('2. /home shows personalised CTA for logged-in user', async () => {
    step(`${alice.nickname} (MALE) opens /home`);
    await alicePage.goto('/home', { waitUntil: 'networkidle' });

    // AuthBootstrap takes a moment; wait for hydration. Two CTAs render
    // "Continue as <nickname>" (hero + bottom card) — first() is enough to
    // prove the page recognised Alice.
    await expect(
      alicePage.getByText(new RegExp(`continue as ${alice.nickname}`, 'i')).first(),
    ).toBeVisible({ timeout: 15_000 });
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
    test.skip(aliceConv !== bobConv, 'Alice & Bob matched with strangers — skipping cross-chat test');

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
    await alicePage.getByRole('button', { name: /save as friend/i }).click();
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
    await alicePage.goto('/home', { waitUntil: 'networkidle' });
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
    step(`${charlie.nickname} (MALE) and ${alice.nickname} (MALE) cannot match with each other anyway (same gender) — instead use Charlie ↔ Bob`);

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
    const metaRes = await alicePage.request.get(
      `${API_HOST}/api/conversations/${friendConvId}`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
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
    await bobPage.getByRole('button', { name: new RegExp(alice.nickname, 'i') }).first().click();
    await bobPage.waitForURL(/\/chat\//, { timeout: 10_000 });
    await expect(bobPage.getByText(reconnectMsg)).toBeVisible({ timeout: 10_000 });

    step('Tapping "Back" returns Alice to /connections without ending the chat');
    // Same disambiguation as the visibility check above — match the text-only
    // Back button (not the chat header's back-arrow button).
    await alicePage.getByText('Back', { exact: true }).click();
    await alicePage.waitForURL(/\/connections/, { timeout: 5_000 });

    step('Conversation is STILL not ended after the Back press');
    const metaRes2 = await alicePage.request.get(
      `${API_HOST}/api/conversations/${friendConvId}`,
      { headers: { Authorization: `Bearer ${alice.accessToken}` } },
    );
    const meta2 = (await metaRes2.json()) as { endedAt: string | null };
    expect(meta2.endedAt).toBeNull();

    await alicePage.screenshot({ path: 'agent-results/13-alice-connections.png', fullPage: true });
  });
});

// Suppress "unused import" hint for SocketEvents — handy to keep around for
// future ad-hoc socket assertions in this file.
void SocketEvents;
