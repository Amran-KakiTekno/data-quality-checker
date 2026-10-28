import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = 'http://127.0.0.1:4105';

async function runValidation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Run validation' }).click();
  await expect(page.getByTestId('issue-total')).toBeVisible();
}

async function expectRuleCounts(
  page: Page,
  expected: Record<string, string>,
): Promise<void> {
  for (const [ruleId, count] of Object.entries(expected)) {
    await expect(page.getByTestId(`rule-count-${ruleId}`)).toHaveText(count);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Data Quality Rules Lab' })).toBeVisible();
});

test('the page shows the synthetic data notice and the parsed records', async ({ page }) => {
  await expect(page.getByText('Synthetic data.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('records-table')).toBeVisible();
  await expect(page.getByTestId('record-row-6')).toContainText('SYN-AST-1006');
});

test('the JSON connector delivers the same six records as the CSV connector', async ({ page }) => {
  await expect(page.getByTestId('record-row-1')).toContainText('SYN-AST-1001');
  await expect(page.getByTestId('record-row-5')).toContainText('ops, lead@@northline.invalid');

  await page.getByRole('radio', { name: 'JSON connector' }).check();

  await expect(page.getByTestId('record-row-1')).toContainText('SYN-AST-1001');
  await expect(page.getByTestId('record-row-5')).toContainText('ops, lead@@northline.invalid');
});

test('running the validation with every rule reports five issues, one per rule', async ({ page }) => {
  await runValidation(page);

  await expect(page.getByTestId('issue-total')).toHaveText('5');
  await expect(page.getByTestId('record-count')).toHaveText('6');
  await expectRuleCounts(page, {
    'required-asset-id': '1',
    'unique-asset-id': '1',
    'numeric-reading': '1',
    'reading-range': '1',
    'email-format': '1',
  });
  await expect(page.getByTestId('issues-list').getByRole('listitem')).toHaveCount(5);
});

test('disabling the email format rule and rerunning reports four issues', async ({ page }) => {
  await runValidation(page);
  await expect(page.getByTestId('issue-total')).toHaveText('5');

  await page.getByRole('checkbox', { name: 'Owner email format' }).uncheck();
  await expect(page.getByTestId('results-cleared')).toBeVisible();

  await runValidation(page);

  await expect(page.getByTestId('issue-total')).toHaveText('4');
  await expectRuleCounts(page, { 'email-format': '0' });
  await expect(page.getByTestId('issues-list').getByRole('listitem')).toHaveCount(4);
});

test('switching the connector and rerunning preserves every count', async ({ page }) => {
  await runValidation(page);
  await expect(page.getByTestId('issue-total')).toHaveText('5');

  await page.getByRole('radio', { name: 'JSON connector' }).check();
  await expect(page.getByTestId('results-cleared')).toBeVisible();

  await runValidation(page);

  await expect(page.getByTestId('issue-total')).toHaveText('5');
  await expectRuleCounts(page, {
    'required-asset-id': '1',
    'unique-asset-id': '1',
    'numeric-reading': '1',
    'reading-range': '1',
    'email-format': '1',
  });
});

test('filtering the issues by rule narrows the list', async ({ page }) => {
  await runValidation(page);

  await page.getByTestId('filter-rule').selectOption('email-format');

  await expect(page.getByTestId('issues-list').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('issue-item')).toContainText('Owner email format');
});

test('filtering the issues by row narrows the list', async ({ page }) => {
  await runValidation(page);

  await page.getByTestId('filter-row').selectOption('3');

  await expect(page.getByTestId('issues-list').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('issue-item')).toContainText('Required assetId');
});

test('an issue can be inspected for its explanation and offending value', async ({ page }) => {
  await runValidation(page);

  await page.getByTestId('filter-rule').selectOption('email-format');
  await page.getByTestId('issue-item').click();

  await expect(page.getByTestId('issue-detail-rule')).toHaveText('Owner email format');
  await expect(page.getByTestId('issue-detail-row')).toHaveText('row 5');
  await expect(page.getByTestId('issue-detail-field')).toHaveText('ownerEmail');
  await expect(page.getByTestId('issue-detail-message')).toContainText('not in the name@host.tld form');
  await expect(page.getByTestId('issue-detail-value')).toHaveText('ops, lead@@northline.invalid');
});

test('the issue report downloads as a CSV with one header and five issue rows', async ({ page }) => {
  await runValidation(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download issue report' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('data-quality-issues.csv');

  const path = await download.path();
  expect(path).not.toBeNull();
  const content = readFileSync(path as string, 'utf8');
  const lines = content.trimEnd().split('\n');

  expect(lines).toHaveLength(6);
  expect(lines[0]).toBe('rowNumber,ruleId,ruleLabel,field,value,message');
  expect(content).toContain('"ops, lead@@northline.invalid"');
});

test('a malformed payload shows a controlled error instead of a partial validation', async ({ page }) => {
  await runValidation(page);
  await expect(page.getByTestId('issue-total')).toHaveText('5');

  await page.getByTestId('malformed-toggle').check();

  await expect(page.getByTestId('connector-error')).toBeVisible();
  await expect(page.getByTestId('connector-error')).toContainText('ownerEmail');
  await expect(page.getByTestId('no-result')).toBeVisible();
  await expect(page.getByTestId('issue-total')).toHaveCount(0);
});

test('the page does not overflow horizontally at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await runValidation(page);
  await page.getByTestId('issue-item').first().click();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('the page has no serious or critical accessibility violations', async ({ page }) => {
  await runValidation(page);
  await page.getByTestId('issue-item').first().click();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking).toEqual([]);
});

test('the running page makes no request to a non-local origin', async ({ page }) => {
  const externalRequests: string[] = [];

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (
      !url.startsWith(BASE_URL) &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:') &&
      !url.startsWith('about:')
    ) {
      externalRequests.push(url);
    }
    await route.continue();
  });

  await runValidation(page);
  await page.getByTestId('issue-item').first().click();
  await expect(page.getByTestId('issue-detail-rule')).toBeVisible();

  expect(externalRequests).toEqual([]);
});
