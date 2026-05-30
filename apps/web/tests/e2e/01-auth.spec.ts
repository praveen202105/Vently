import { test, expect } from '@playwright/test';
import { provisionUserViaApi, uniqueEmail } from './helpers';

test.describe('Phase 1 — Auth + Profile', () => {
  test('register → onboarding → profile renders me', async ({ page }) => {
    const email = uniqueEmail('reg');
    const nickname = `reg_${Math.random().toString(36).slice(2, 8)}`;

    await page.goto('/register', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // Successful register → onboarding form.
    await page.waitForURL(/\/onboarding/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /pick your name/i })).toBeVisible();

    await page.getByLabel('Nickname').fill(nickname);
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /continue/i }).click();

    // Onboarding finished → mood screen.
    await page.waitForURL(/\/mood/);
    await expect(page.getByRole('heading', { name: /how are you feeling/i })).toBeVisible();

    // Profile route should now load the persisted nickname.
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
    await expect(page.getByText(/chat personalization/i)).toHaveCount(0);
    await expect(page.getByText(/clear personalization/i)).toHaveCount(0);
  });

  test('protected route redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/chat/some-nonexistent-id');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('next=%2Fchat%2Fsome-nonexistent-id');
  });

  test('login rejects bad credentials', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill('definitely.not.real@example.com');
    await page.getByLabel('Password').fill('wrongpassword1');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Sonner toast pops up with the error.
    await expect(page.getByText(/invalid/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('login page only asks for credentials', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Nickname')).toHaveCount(0);
    await expect(page.getByText(/^Gender$/)).toHaveCount(0);
    await expect(page.getByLabel(/Bio/i)).toHaveCount(0);
  });

  test('login with an existing profile skips onboarding', async ({ page }) => {
    const user = await provisionUserViaApi({ gender: 'MALE' });

    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/mood/);
    await expect(page.getByRole('heading', { name: /how are you feeling/i })).toBeVisible();
    await expect(page.getByLabel('Nickname')).toHaveCount(0);
  });

  test('logged-in user is not shown the public home page', async ({ page }) => {
    const user = await provisionUserViaApi({ gender: 'FEMALE' });

    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/mood/);

    await page.goto('/home', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/mood/);
    await expect(page.getByRole('heading', { name: /how are you feeling/i })).toBeVisible();
    await expect(page.getByText(new RegExp(`continue as ${user.nickname}`, 'i'))).toHaveCount(0);
  });
});
