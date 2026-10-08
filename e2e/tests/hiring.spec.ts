import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { captureDiagnostics } from './diagnostics';

// Journey 3 (docs/00-master-plan.md §7): offer approved → sent → accepted → Hired, which creates
// the employee and onboarding plan (verified in the API integration tests) and notifies the AM.
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

/** Thin API client for test setup: the journey under test is the UI part. */
async function apiAs(request: APIRequestContext, baseURL: string, email: string) {
  const login = await request.post('/api/v1/auth/login', {
    data: { email, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(login.ok()).toBe(true);
  const { accessToken, user } = (await login.json()) as {
    accessToken: string;
    user: { id: string };
  };
  const call = async (method: 'GET' | 'POST', path: string, data?: unknown) => {
    const res = await request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
    return res.json();
  };
  return { id: user.id, call };
}

test('an accepted offer leads to a hire', async ({ page, request, baseURL }) => {
  // Three users and ~20 setup calls: give it 3x the normal budget (locally Neon is ~4 s/request).
  test.slow();
  const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const origin = baseURL!;
  const hr = await apiAs(request, origin, 'hr@staffos.demo');
  const recruiter = await apiAs(request, origin, 'recruiter@staffos.demo');
  const hm = await apiAs(request, origin, 'hm@staffos.demo');

  // Setup through the API: our own job (so repeated runs never fill a shared one) and a candidate
  // moved to the Offer stage with a pending offer.
  const approved = await hr.call('GET', '/manpower-requests?pageSize=1&filter[status]=APPROVED');
  let job = await hr.call('POST', '/jobs', {
    manpowerRequestId: approved.data[0].id,
    title: `E2E Hire ${unique}`,
    headcount: 50,
    recruiterIds: [recruiter.id],
    hiringManagerId: hm.id,
    skills: [],
  });
  job = await hr.call('POST', `/jobs/${job.id}/publish`, { version: job.version });
  const candidate = await recruiter.call('POST', '/candidates', {
    firstName: 'Noura',
    lastName: `Hire ${unique}`,
    email: `noura-${unique}@candidates.example`,
  });
  let application = await recruiter.call('POST', '/applications', {
    candidateId: candidate.id,
    jobId: job.id,
  });
  for (const to of ['SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER']) {
    application = await recruiter.call('POST', `/applications/${application.id}/transition`, {
      to,
      version: application.version,
    });
  }
  const start = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await recruiter.call('POST', '/offers', {
    applicationId: application.id,
    salaryFils: 600_000,
    startDate: start,
    contractType: 'PERMANENT',
  });
  const url = `/applications/${application.id}`;

  // Hiring manager approves.
  await signIn(page, 'hm@staffos.demo');
  await page.goto(url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await signOut(page);

  // Recruiter sends it, records the acceptance and hires.
  await signIn(page, 'recruiter@staffos.demo');
  await page.goto(url);
  await page.getByRole('button', { name: 'Mark as sent' }).click();
  await page.getByRole('button', { name: 'Candidate accepted' }).click();
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hire', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hire' }).click();
  await expect(
    page.getByText(/hired\. Employee record and onboarding plan created\./),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: new RegExp(`Noura Hire ${unique}`) }),
  ).toContainText('Hired');
});
