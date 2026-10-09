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
  // The test database holds many users; search rather than assume page 1.
  await page.getByLabel('Search users').fill('recruiter@staffos.demo');
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

// Journey 5 (docs/00-master-plan.md §7): another client's data is invisible, by URL and by API.
test("a client user cannot open another client's request (UI and API)", async ({
  browser,
  page,
}) => {
  // Find a request that belongs to a different client, as an admin.
  const adminPage = await (await browser.newContext()).newPage();
  await signIn(adminPage, 'admin@staffos.demo');
  await expect(adminPage.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  const otherId = await adminPage.evaluate(async () => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST' });
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    const res = await fetch('/api/v1/manpower-requests?pageSize=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { data } = (await res.json()) as { data: { id: string; client: { name: string } }[] };
    return data.find((r) => !r.client.name.startsWith('Gulf Build'))?.id;
  });
  expect(otherId).toBeTruthy();
  await adminPage.context().close();

  await signIn(page, 'client@staffos.demo');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.goto(`/requests/${otherId}`);
  await expect(page.getByText('Manpower request not found.')).toBeVisible();
  const status = await page.evaluate(async (id) => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST' });
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    return (
      await fetch(`/api/v1/manpower-requests/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).status;
  }, otherId);
  expect(status).toBe(404); // not 403: the record's existence isn't revealed
});

test('wrong credentials show an error without revealing whether the account exists', async ({
  page,
}) => {
  await signIn(page, 'nobody@staffos.demo', 'Not-The-Password-1');

  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login/);
});
