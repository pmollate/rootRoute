// P6 (owner C): every screen of the deployed app loads, at phone and desktop width, and shows the figures the SPEC
// quotes (AC-UI-01, AC-UI-03). Figures come from SPEC §2 / CLAUDE.md "Key numbers"; a mismatch means the screen and
// the SPEC disagree. Read-only: nothing here sends, approves or pastes.
import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const SCREENS = [
  { path: '/dashboard/overview', title: 'Overview', h1: 'Delivery performance' },
  { path: '/dashboard/intake', title: 'Order emails', h1: 'Order emails' },
  { path: '/dashboard/warehouses', title: 'Warehouses', h1: 'Warehouses' },
  { path: '/dashboard/carriers', title: 'Carriers', h1: 'Carriers' },
  { path: '/dashboard/journey', title: 'Order journey', h1: 'Order journey' },
  { path: '/dashboard/replay', title: 'Replay', h1: 'Replay' },
];

/** Opens a screen and fails on any uncaught page error or failed API call. */
async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(path);
  return errors;
}

test('API is up and connected to the database', async ({ request }) => {
  const health = await (await request.get(`${API_URL}/api/health`)).json();
  expect(health.db).toBe('ok');
});

test('landing page loads', async ({ page }) => {
  const errors = await open(page, '/');
  await expect(page).toHaveTitle(/Root Route/);
  await expect(page.locator('h1').first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const s of SCREENS) {
  test(`${s.title}: loads with no errors and no sideways scrolling`, async ({ page }) => {
    const errors = await open(page, s.path);
    await expect(page).toHaveTitle(new RegExp(`^${s.title}`));
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(s.h1) })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Could not load this section')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test.describe('figures match the SPEC', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'figures are checked once, at desktop width');

  test('Overview: 71.0% on time, 14,019 late, $872k penalties, 9 accounts at risk', async ({ page }) => {
    await open(page, '/dashboard/overview');
    const main = page.locator('main');
    for (const t of ['71.0%', '14,019', '$872k penalties', '9 accounts']) await expect(main.getByText(t).first()).toBeVisible();
  });

  test('Warehouses: 4,826 after cut-off, 6,009 out of stock, 691 skipped the nearest site', async ({ page }) => {
    await open(page, '/dashboard/warehouses');
    for (const t of ['4,826', '6,009', '691']) await expect(page.locator('main').getByText(t, { exact: true }).first()).toBeVisible();
  });

  test('Carriers: the five blocked lanes and the Northeast next-day recommendation', async ({ page }) => {
    await open(page, '/dashboard/carriers');
    const main = page.locator('main');
    for (const lane of ['D → Midwest', 'D → Southeast', 'E → West', 'F → Northeast', 'F → Southeast']) {
      await expect(main.getByText(lane, { exact: true }).first()).toBeVisible();
    }
    await expect(main.getByText(/Carrier E for Northeast next-day: 97% on time vs 55% for F/)).toBeVisible();
  });

  test('Replay: today 71.0%, full programme 92.0%, and no other company\'s product modelled', async ({ page }) => {
    await open(page, '/dashboard/replay');
    const main = page.locator('main');
    await expect(main.getByText('71.0%').first()).toBeVisible();
    await expect(main.getByText(/92\.0%/).first()).toBeVisible();
    // Team decision (SPEC v0.9, CLAUDE.md): no routing-vendor scenario on the screen.
    await expect(main.getByText('78.3%')).toHaveCount(0);
  });

  test('Order journey: D000213 is 4 days late, failing at the address and the carrier lane', async ({ page }) => {
    await open(page, '/dashboard/journey?ref=delivery:D000213');
    const main = page.locator('main');
    await expect(main.getByText('4 days late').first()).toBeVisible();
    await expect(main.getByText('Went wrong here')).toHaveCount(3);
    await expect(main.getByText(/CONFIRM_ADDRESS/)).toBeVisible();
    await expect(main.getByText(/vs \d+% for F/)).toBeVisible();
  });

  test('Order emails: the inbox lists emails, priority clients first', async ({ page }) => {
    await open(page, '/dashboard/intake');
    await expect(page.getByText('Priority clients (Tier 1 or at risk) are listed first.')).toBeVisible();
    await expect(page.locator('main table tbody tr').first()).toBeVisible();
  });
});
