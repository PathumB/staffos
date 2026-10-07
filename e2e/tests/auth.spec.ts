import { expect, type Page, test } from '@playwright/test';

// Seeded demo accounts (apps/api/src/seed/demo.ts). Fictional data.
const PASSWORD = 'StaffOS-Demo-2026!';

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('admin signs in, manages users, and the session survives a reload', async ({ page }) => {
  await signIn(page, 'admin@staffos.demo');

  await expect(page.getByRole('heading', { name: 'Welcome, Layla' })).toBeVisible();

  // Mobile layouts open the navigation drawer first.
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click();

  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByText('recruiter@staffos.demo')).toBeVisible();

  // Access token is in memory only; the refresh cookie restores the session.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a recruiter cannot open admin pages (UI and API)', async ({ page }) => {
  await signIn(page, 'recruiter@staffos.demo');
  await expect(page.getByRole('heading', { name: 'Welcome, Priya' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);

  await page.goto('/admin/audit-log');
  await expect(page.getByRole('heading', { name: /don.t have access/ })).toBeVisible();

  // The API refuses too, regardless of the UI.
  const status = await page.evaluate(async () => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST' });
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    return (
      await fetch('/api/v1/audit-logs', { headers: { Authorization: `Bearer ${accessToken}` } })
    ).status;
  });
  expect(status).toBe(403);
});

test('wrong credentials show an error without revealing whether the account exists', async ({
  page,
}) => {
  await signIn(page, 'nobody@staffos.demo', 'Not-The-Password-1');

  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login/);
});
