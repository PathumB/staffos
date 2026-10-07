import { expect, test } from '@playwright/test';

test('anonymous visitors are sent to the sign-in page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('theme toggle switches to dark mode and is keyboard reachable', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');

  const toggle = page.getByRole('button', { name: 'Switch to dark mode' });
  await toggle.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('API health works through the same-origin proxy with security headers', async ({
  request,
}) => {
  const res = await request.get('/api/v1/health');

  expect([200, 503]).toContain(res.status());
  expect(res.headers()['x-request-id']).toBeTruthy();
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});
