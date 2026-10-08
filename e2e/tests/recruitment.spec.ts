import { expect, type Page, test } from '@playwright/test';

// Journey 1 (second half, docs/00-master-plan.md §7): approved request → job → candidate in pipeline,
// plus the "illegal stage jump is rejected by the API" negative test.
const PASSWORD = 'StaffOS-Demo-2026!';

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

test('HR opens a job from an approved request; the recruiter moves a new candidate through the pipeline', async ({
  page,
}) => {
  const unique = Date.now().toString(36);

  // HR Manager: approved request → open job → publish.
  await signIn(page, 'hr@staffos.demo');
  // Search: the test database also holds many integration-test requests.
  await page.goto('/requests?status=APPROVED&search=Site%20Electrician');
  await page.getByRole('link', { name: 'Site Electrician' }).first().click();
  await page.getByRole('button', { name: 'Open job' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Job title').fill(`Site Electrician ${unique}`);
  await form.getByLabel('Hiring manager').selectOption({ label: 'Fatima Al Zaabi' });
  await form.getByLabel('Priya Nair').check();
  await form.getByRole('button', { name: 'Open job' }).click();

  await expect(
    page.getByRole('heading', { name: new RegExp(`Site Electrician ${unique}`) }),
  ).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Open', { exact: true })).toBeVisible();
  const jobUrl = page.url();
  await signOut(page);

  // Recruiter: add a brand-new candidate and move them to Screening.
  await signIn(page, 'recruiter@staffos.demo');
  await page.goto(jobUrl);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await page.getByRole('button', { name: 'Create a new candidate' }).click();
  const candidateForm = page.getByRole('dialog');
  await candidateForm.getByLabel('First name').fill('Yusuf');
  await candidateForm.getByLabel('Last name').fill(`Hamdan ${unique}`);
  await candidateForm.getByLabel('Email').fill(`yusuf.${unique}@candidates.example`);
  await candidateForm.getByRole('button', { name: 'Create candidate' }).click();

  const applied = page.getByRole('region', { name: /^Applied/ });
  await expect(applied.getByText(`Yusuf Hamdan ${unique}`)).toBeVisible();
  await applied.getByRole('button', { name: `Move Yusuf Hamdan ${unique}` }).click();
  await page.getByRole('menuitem', { name: 'Screening' }).click();
  await expect(
    page.getByRole('region', { name: /^Screening/ }).getByText(`Yusuf Hamdan ${unique}`),
  ).toBeVisible();

  // The API refuses an illegal jump even if someone bypasses the UI.
  const result = await page.evaluate(async (jobId) => {
    const { accessToken } = (await (
      await fetch('/api/v1/auth/refresh', { method: 'POST' })
    ).json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const pipeline = (await (
      await fetch(`/api/v1/jobs/${jobId}/pipeline`, { headers })
    ).json()) as {
      columns: { stage: string; applications: { id: string; version: number }[] }[];
    };
    const card = pipeline.columns.find((c) => c.stage === 'SCREENING')!.applications[0]!;
    const res = await fetch(`/api/v1/applications/${card.id}/transition`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: 'HIRED', version: card.version }),
    });
    return { status: res.status, code: ((await res.json()) as { code: string }).code };
  }, jobUrl.split('/').pop());
  expect(result).toEqual({ status: 409, code: 'INVALID_TRANSITION' });
});
