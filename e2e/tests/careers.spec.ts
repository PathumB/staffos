import { expect, test } from '@playwright/test';
import { captureDiagnostics } from './diagnostics';

// Journey 1 (docs/00-master-plan.md §7), last leg: a candidate applies through the public careers
// portal and appears in the job's pipeline.
const PASSWORD = 'StaffOS-Demo-2026!';
captureDiagnostics();

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(500, 0x20)]);

test('a candidate applies on the careers site and appears in the pipeline', async ({ page }) => {
  test.slow();
  const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const lastName = `Careers ${unique}`;

  // Anonymous visitor: browse, open the demo forklift role, apply.
  await page.goto('/careers?search=Forklift');
  await expect(page.getByRole('link', { name: 'Forklift Operator' }).first()).toBeVisible();
  // The shared test database holds many forklift jobs; apply to the seeded demo one, which
  // recruiter@staffos.demo works on.
  await page.goto('/careers/forklift-operator-demo0');
  await expect(page.getByRole('heading', { name: 'Forklift Operator', level: 1 })).toBeVisible();
  await page.getByLabel('First name').fill('Hana');
  await page.getByLabel('Last name').fill(lastName);
  await page.getByLabel('Email').fill(`hana-${unique}@candidates.example`);
  await page.getByLabel('Mobile number').fill('+971 55 123 4567');
  await page
    .getByLabel(/^CV/)
    .setInputFiles({ name: 'hana-cv.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send application' }).click();
  await expect(page.getByText(/We have received your application/)).toBeVisible();

  // The private tracking page shows a candidate-friendly status.
  await page.getByRole('link', { name: 'Track my application' }).click();
  await expect(page.getByRole('heading', { name: /Status: Received/ })).toBeVisible();

  // The assigned recruiter sees the new applicant in the Applied column.
  await page.goto('/login');
  await page.getByLabel('Email').fill('recruiter@staffos.demo');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.goto('/jobs?search=Forklift%20Operator&status=OPEN');
  await page.getByRole('link', { name: 'Forklift Operator', exact: true }).first().click();
  await expect(page.getByRole('region', { name: /^Applied/ })).toContainText(`Hana ${lastName}`);
});
