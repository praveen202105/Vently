import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loginPage, provisionUserViaApi } from './helpers';

test.skip(
  process.env.E2E_AI_FALLBACK !== 'true',
  'AI fallback e2e requires API env AI_FALLBACK_ENABLED=true and AI_FALLBACK_TEST_MODE=true',
);

async function createLoggedInPage(browser: Browser, gender: 'MALE' | 'FEMALE') {
  const user = await provisionUserViaApi({ gender });
  const ctx: BrowserContext = await browser.newContext();
  const page = await ctx.newPage();
  await loginPage(page, ctx, user);
  return { ctx, page };
}

async function waitForAIFallbackChat(page: Page, moodName: RegExp) {
  await page.goto('/mood', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: moodName }).click();
  await page.waitForURL(/\/matching/);
  await page.waitForURL(/\/chat\/ai_conv_/, { timeout: 30_000 });

  const conversationId = page.url().split('/chat/')[1] ?? '';
  expect(conversationId).toMatch(/^ai_conv_/);
  await expect(page.locator('header p').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/glad we matched/i)).toBeVisible({ timeout: 10_000 });

  return conversationId;
}

async function openChatOptions(page: Page) {
  await page.getByRole('button', { name: /more options/i }).click();
}

test.describe('AI Fallback Peer', () => {
  test('spawns an AI chat, hides human-only actions, replies, and expires on end', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const { ctx, page } = await createLoggedInPage(browser, 'MALE');
    try {
      const conversationId = await waitForAIFallbackChat(page, /need to talk/i);

      await expect(page.getByRole('button', { name: /start voice call/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /start video call/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /save as friend/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /report user/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /block user/i })).toHaveCount(0);
      await openChatOptions(page);
      await expect(page.getByRole('menuitem', { name: /save as friend/i })).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: /report user/i })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /block user/i })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /end chat/i })).toBeVisible();
      await page.keyboard.press('Escape');

      const probe = `fallback probe ${Date.now()}`;
      await page.getByPlaceholder(/type a message/i).fill(probe);
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText(probe)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(new RegExp(`about "${probe}"`, 'i'))).toBeVisible({
        timeout: 10_000,
      });

      await openChatOptions(page);
      await page.getByRole('menuitem', { name: /end chat/i }).click();
      await page.getByRole('button', { name: /end chat/i }).click();
      await page.waitForURL(/\/mood/, { timeout: 10_000 });

      await page.goto(`/chat/${conversationId}`, { waitUntil: 'networkidle' });
      await page.waitForURL(/\/connections/, { timeout: 10_000 });

      const nextConversationId = await waitForAIFallbackChat(page, /need to talk/i);
      expect(nextConversationId).toMatch(/^ai_conv_/);
      expect(nextConversationId).not.toBe(conversationId);
    } finally {
      await ctx.close();
    }
  });

  test('supports local search and report submission inside an AI chat', async ({ browser }) => {
    test.setTimeout(90_000);

    const { ctx, page } = await createLoggedInPage(browser, 'FEMALE');
    try {
      await waitForAIFallbackChat(page, /friendship/i);

      const searchable = `searchable fallback note ${Date.now()}`;
      await page.getByPlaceholder(/type a message/i).fill(searchable);
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText(searchable)).toBeVisible({ timeout: 5_000 });

      await page.getByRole('button', { name: /search messages/i }).click();
      await page.getByPlaceholder(/search messages/i).fill('searchable fallback');
      await expect(page.getByText(/result/i).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(searchable).last()).toBeVisible();
      await page.getByRole('button', { name: /close search/i }).click();

      await openChatOptions(page);
      await page.getByRole('menuitem', { name: /report user/i }).click();
      await expect(page.getByRole('dialog', { name: /report user/i })).toBeVisible();
      await page.getByLabel(/spam/i).check();
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByText(/report submitted/i)).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test('reuses the active AI chat when the user searches again', async ({ browser }) => {
    test.setTimeout(60_000);

    const { ctx, page } = await createLoggedInPage(browser, 'MALE');
    try {
      const firstConversationId = await waitForAIFallbackChat(page, /need to talk/i);

      // Simulate the user leaving the AI chat without ending it. The backend
      // should now return the active AI session instead of treating the user
      // as unavailable due to the per-user throttle.
      await page.goto('/mood', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /need to talk/i }).click();
      await page.waitForURL(/\/matching/);
      await page.waitForURL(/\/chat\/ai_conv_/, { timeout: 30_000 });
      expect(page.url()).toContain(firstConversationId);
    } finally {
      await ctx.close();
    }
  });

  test('keeps AI peer metadata after refreshing the active chat', async ({ browser }) => {
    test.setTimeout(90_000);

    const { ctx, page } = await createLoggedInPage(browser, 'MALE');
    try {
      await waitForAIFallbackChat(page, /need to talk/i);
      await expect(page.locator('header p').first()).not.toHaveText('Stranger', {
        timeout: 10_000,
      });
      await openChatOptions(page);
      await expect(page.getByRole('menuitem', { name: /report user/i })).toBeEnabled();
      await page.keyboard.press('Escape');

      await page.reload({ waitUntil: 'networkidle' });

      await expect(page.locator('header p').first()).not.toHaveText('Stranger', {
        timeout: 10_000,
      });
      await openChatOptions(page);
      await expect(page.getByRole('menuitem', { name: /report user/i })).toBeEnabled();
    } finally {
      await ctx.close();
    }
  });
});
