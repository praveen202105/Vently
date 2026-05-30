import { expect, request, test } from '@playwright/test';
import { API_URL, loginPage, provisionUserViaApi } from './helpers';

test.describe('Chat header', () => {
  test('renders WhatsApp-style primary actions and overflow menu', async ({ browser }) => {
    const alice = await provisionUserViaApi({ gender: 'FEMALE' });
    const bob = await provisionUserViaApi({ gender: 'MALE' });

    const api = await request.newContext({ baseURL: API_URL });
    const sendRes = await api.post('/api/friends/requests', {
      data: { toUserId: bob.userId },
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    expect(sendRes.ok()).toBeTruthy();

    const incomingRes = await api.get('/api/friends/requests', {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(incomingRes.ok()).toBeTruthy();
    const incoming = (await incomingRes.json()) as Array<{ id: string; fromUserId: string }>;
    const requestRow = incoming.find((row) => row.fromUserId === alice.userId);
    expect(requestRow).toBeTruthy();

    const acceptRes = await api.patch(`/api/friends/requests/${requestRow!.id}`, {
      data: { accept: true },
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(acceptRes.ok()).toBeTruthy();
    const accepted = (await acceptRes.json()) as { conversationId: string };
    expect(accepted.conversationId).toBeTruthy();

    const ctx = await browser.newContext();
    await ctx.grantPermissions(['microphone', 'camera'], {
      origin: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    });
    const page = await ctx.newPage();
    await loginPage(page, ctx, alice);
    await page.goto(`/chat/${accepted.conversationId}`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('chat-peer-name')).toHaveText(bob.nickname);
    await expect(page.getByTestId('chat-peer-status')).toHaveText(/online|typing|offline|—/i);
    await expect(page.getByRole('button', { name: /start voice call/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /start video call/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /search messages/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /more options/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /report user/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /block user/i })).toHaveCount(0);

    await page.getByRole('button', { name: /more options/i }).click();
    await expect(page.getByRole('menuitem', { name: /report user/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /block user/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /back to connections/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /save as friend/i })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /search messages/i }).click();
    await expect(page.getByPlaceholder(/search messages/i)).toBeVisible();
    await page.getByRole('button', { name: /close search/i }).click();
    await expect(page.getByPlaceholder(/search messages/i)).toHaveCount(0);

    await page.getByRole('button', { name: /start video call/i }).click();
    await page.waitForURL(/\/call\/.*mode=video/);
    await expect(page.getByTestId('remote-video')).toBeVisible();
    await expect(page.getByTestId('local-video-preview')).toBeVisible();
    await expect(page.getByRole('button', { name: /start video call/i })).toBeVisible();
    await page.getByRole('button', { name: /start video call/i }).click();
    await expect(page.getByRole('button', { name: /hang up/i })).toBeVisible();
    await page.getByRole('button', { name: /hang up/i }).click();
    await page.waitForURL(/\/chat\//);

    await api.dispose();
    await ctx.close();
  });
});
