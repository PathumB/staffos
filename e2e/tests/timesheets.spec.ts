import { expect, test } from '@playwright/test';
import { captureDiagnostics } from './diagnostics';

// Journey 4 (docs/00-master-plan.md §7): an employee's submitted timesheet is approved by the
// client, then Finance generates and issues the invoice.
const PASSWORD = 'StaffOS-Demo-2026!';
captureDiagnostics();

test('the client approves a timesheet and Finance invoices it', async ({
  page,
  request,
  baseURL,
}) => {
  test.slow();
  // Setup through the API as HR (entering hours on the worker's behalf): a random future week on
  // the seeded demo deployment, so repeated runs never collide.
  const login = await request.post('/api/v1/auth/login', {
    data: { email: 'hr@staffos.demo', password: PASSWORD },
    headers: { Origin: baseURL! },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const deps = await request.get('/api/v1/deployments?filter[status]=ACTIVE&search=Ahmed', {
    headers: auth,
  });
  const deployment = ((await deps.json()) as { data: { id: string }[] }).data[0]!;
  const monday = new Date('2030-01-07T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() + 7 * Math.floor(Math.random() * 2_000));
  const day = (n: number) => new Date(monday.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const created = await request.post('/api/v1/timesheets', {
    headers: auth,
    data: {
      deploymentId: deployment.id,
      weekStart: day(0),
      entries: [0, 1, 2, 3, 4].map((n) => ({ date: day(n), minutes: 480 })),
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const sheet = (await created.json()) as { id: string; version: number };
  const submitted = await request.post(`/api/v1/timesheets/${sheet.id}/submit`, {
    headers: auth,
    data: { version: sheet.version },
  });
  expect(submitted.ok(), await submitted.text()).toBe(true);

  // The client user approves it.
  await page.goto('/login');
  await page.getByLabel('Email').fill('client@staffos.demo');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.goto(`/timesheets/${sheet.id}`);
  await expect(page.getByRole('heading', { name: `Week of ${day(0)}` })).toContainText('Submitted');
  await expect(page.getByRole('cell', { name: '40h' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Timesheet approved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Week of ${day(0)}` })).toContainText('Approved');

  // Finance invoices that week for the client and issues the invoice.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.getByLabel('Email').fill('finance@staffos.demo');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.goto('/invoices');
  await page.getByRole('button', { name: 'Generate invoice' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Search clients').fill('Gulf Build Contracting');
  await expect(dialog.getByRole('option', { name: 'Gulf Build Contracting LLC' })).toBeAttached();
  await dialog
    .getByLabel('Client', { exact: true })
    .selectOption({ label: 'Gulf Build Contracting LLC' });
  await dialog.getByLabel('From').fill(day(0));
  await dialog.getByLabel('To').fill(day(6));
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByRole('heading', { name: /Draft invoice/ })).toBeVisible();
  // 40 h at AED 45/h = AED 1,800.00 + 5% VAT = AED 1,890.00
  await expect(page.getByText('AED 1,890.00')).toBeVisible();
  await page.getByRole('button', { name: 'Issue' }).click();
  await expect(page.getByRole('heading', { name: /INV-\d{4}-\d{6}/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF' })).toBeVisible();
});
