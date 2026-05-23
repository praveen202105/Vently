import { test, expect } from '@playwright/test';
import { provisionUserViaApi, API_URL } from './helpers';
import { request } from '@playwright/test';

// Phase 5 — verifies the REST + moderation surface without depending on a
// successful UI match, since these endpoints are independent.

test.describe('Phase 5 — Reports + moderation + notifications', () => {
  test('POST /reports persists a Report row', async () => {
    const reporter = await provisionUserViaApi();
    const reported = await provisionUserViaApi();

    const ctx = await request.newContext({ baseURL: API_URL });
    const res = await ctx.post('/api/reports', {
      headers: { Authorization: `Bearer ${reporter.accessToken}` },
      data: {
        reportedId: reported.userId,
        reason: 'HARASSMENT',
        details: 'e2e test report',
      },
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(/^[a-z0-9]+$/);
  });

  test('POST /reports refuses self-report', async () => {
    const user = await provisionUserViaApi();
    const ctx = await request.newContext({ baseURL: API_URL });
    const res = await ctx.post('/api/reports', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { reportedId: user.userId, reason: 'SPAM' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /notifications + mark-read flow', async () => {
    const alice = await provisionUserViaApi();
    const bob = await provisionUserViaApi();

    const ctx = await request.newContext({ baseURL: API_URL });
    const reqRes = await ctx.post('/api/friends/requests', {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
      data: { toUserId: bob.userId },
    });
    expect(reqRes.ok()).toBeTruthy();

    const list = await ctx.get('/api/notifications', {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(list.ok()).toBeTruthy();
    const items = (await list.json()) as Array<{ id: string; type: string; readAt: string | null }>;
    const friendNotif = items.find((n) => n.type === 'FRIEND_REQUEST');
    expect(friendNotif, 'expected a FRIEND_REQUEST notification').toBeTruthy();
    expect(friendNotif!.readAt).toBeNull();

    const markRes = await ctx.patch(`/api/notifications/${friendNotif!.id}/read`, {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(markRes.status()).toBe(204);

    const list2 = await ctx.get('/api/notifications', {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    const after = (await list2.json()) as Array<{ id: string; readAt: string | null }>;
    expect(after.find((n) => n.id === friendNotif!.id)?.readAt).toBeTruthy();
  });
});
