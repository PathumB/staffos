import { test } from '@playwright/test';

/**
 * On failure, print what the page actually showed plus any failed API calls. CI logs need a
 * GitHub login, so ci.yml re-publishes these `[diag]` lines as public annotations.
 */
export function captureDiagnostics() {
  const failures = new WeakMap<object, string[]>();

  test.beforeEach(({ page }) => {
    const list: string[] = [];
    failures.set(page, list);
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/api/')) {
        list.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
      }
    });
    page.on('pageerror', (err) => list.push(`pageerror: ${err.message}`));
  });

  test.afterEach(async ({ page }, info) => {
    if (info.status === info.expectedStatus) return;
    const text = await page
      .locator('body')
      .innerText({ timeout: 2_000 })
      .catch(() => '(no body)');
    const lines = [
      `[diag] ${info.project.name} › ${info.title}`,
      `[diag] url: ${page.url()}`,
      `[diag] api errors: ${(failures.get(page) ?? []).join(' | ') || 'none'}`,
      `[diag] page text: ${text.replace(/\s+/g, ' ').slice(0, 400)}`,
    ];
    console.error(lines.join('\n'));
  });
}
