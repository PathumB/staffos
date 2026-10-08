import { expect, test } from '@playwright/test';
import { captureDiagnostics } from './diagnostics';

// Journey 4 (docs/00-master-plan.md §7), first half: an employee's submitted timesheet is
// approved by the client in their portal. (The invoice half arrives with the invoices module.)
const PASSWORD = 'StaffOS-Demo-2026!';
captureDiagnostics();

test('the client approves a submitted timesheet', async ({ page, request, baseURL }) => {
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
});
