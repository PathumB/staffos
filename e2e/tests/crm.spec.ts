import { expect, type Page, test } from '@playwright/test';
import { captureDiagnostics } from './diagnostics';

// Journey 1 (first half, docs/00-master-plan.md §7): client request → HR approval.
const PASSWORD = 'StaffOS-Demo-2026!';
captureDiagnostics();

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test('a request over 20 people needs HR approval before it is approved', async ({ page }) => {
  // Account manager logs 25 heavy drivers for Gulf Build Contracting.
  await signIn(page, 'am@staffos.demo');
  await page.goto('/requests');
  await page.getByRole('button', { name: 'New request' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Client').selectOption({ label: 'Gulf Build Contracting LLC' });
  await form.getByLabel('Role title').fill('Heavy Vehicle Driver (E2E)');
  await form.getByLabel('Headcount').fill('25');
  await form.getByLabel('Start date').fill('2027-03-01');
  await form.getByLabel('Location').fill('Dubai South');
  await form.getByRole('button', { name: 'Save draft' }).click();

  await expect(
    page.getByRole('heading', { name: '25 × Heavy Vehicle Driver (E2E)' }),
  ).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  const requestUrl = page.url();

  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Pending HR approval', { exact: true })).toBeVisible();
  // Account managers cannot approve their own requests.
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await signOut(page);

  // HR Manager approves with a comment.
  await signIn(page, 'hr@staffos.demo');
  await page.goto(requestUrl);
  await page.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Comment/).fill('Budget confirmed with client');
  await dialog.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('“Budget confirmed with client”')).toBeVisible();
});

test('a client user only sees their own company', async ({ page }) => {
  await signIn(page, 'client@staffos.demo');
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Clients' })
    .click();

  await expect(page.getByRole('link', { name: 'Gulf Build Contracting LLC' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Al Noor Logistics LLC' })).toHaveCount(0);
});
