import { expect, test } from '@playwright/test';

// Scaffold smoke test: web → same-origin /api proxy → API. The five critical journeys
// (docs/00-master-plan.md §7) are added as their modules land.

test('home page loads and reaches the API through the same-origin proxy', async ({ page }) => {
  const healthResponse = page.waitForResponse((res) => res.url().endsWith('/api/v1/health'));

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect([200, 503]).toContain((await healthResponse).status());
  await expect(page.getByText('Version')).toBeVisible();
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to home' }).click();
  await expect(page).toHaveURL('/');
});

test('theme toggle switches to dark mode and is keyboard reachable', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Switch to dark mode' });
  await toggle.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});

test('API responses carry security headers and a request id', async ({ request }) => {
  const res = await request.get('/api/v1/health');

  expect(res.headers()['x-request-id']).toBeTruthy();
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});
