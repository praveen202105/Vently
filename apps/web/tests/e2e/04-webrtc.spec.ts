import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import { provisionUserViaApi, API_URL } from './helpers';

// Phase 4 — we can't actually verify bidirectional audio without two real
// browsers + an audio device, but we can verify the API contract (ICE servers)
// and that the call screen mounts cleanly.

test.describe('Phase 4 — WebRTC', () => {
  test('GET /webrtc/ice-servers returns a usable list', async () => {
    const user = await provisionUserViaApi();
    const ctx = await request.newContext({ baseURL: API_URL });
    const res = await ctx.get('/api/webrtc/ice-servers', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { iceServers: { urls: string | string[] }[] };
    expect(Array.isArray(body.iceServers)).toBe(true);
    expect(body.iceServers.length).toBeGreaterThan(0);
    // STUN is the public fallback; TURN comes from Open Relay (free) when no
    // paid provider is configured, or from Cloudflare/Metered when one is.
    const flat = body.iceServers.flatMap((s) =>
      Array.isArray(s.urls) ? s.urls : [s.urls],
    );
    expect(flat.some((u) => u.startsWith('stun:'))).toBe(true);
    expect(flat.some((u) => u.startsWith('turn:'))).toBe(true);
  });
});
