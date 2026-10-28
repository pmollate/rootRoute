// UI automation of the order-to-delivery workflow (Order journey, D9, docs/SPEC-order-workflow.md), owner C.
// Only this workflow is automated; other screens are covered by their unit tests. Read-only: nothing here sends,
// approves or pastes. Past deliveries are fixed rows of the supplied data; order emails are read from the live inbox.
import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const JOURNEY = '/dashboard/journey';

/** Opens the journey page for a ref and fails on any page error or API 5xx. */
async function open(page: Page, ref?: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(ref ? `${JOURNEY}?ref=${ref}` : JOURNEY);
  await expect(page.getByRole('heading', { level: 1, name: 'Order journey' })).toBeVisible();
  return errors;
}
/** One timeline row by its stage label. */
const stage = (page: Page, label: string) => page.locator('main ol > li').filter({ has: page.getByText(label, { exact: true }) });

test.describe('past delivery: where it went wrong, and what LateLens would do', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'checked once, at desktop width');

  test('D000213 (default): incomplete address and a blocked carrier lane, 4 days late', async ({ page }) => {
    const errors = await open(page);
    const main = page.locator('main');
    await expect(main.getByText('4 days late').first()).toBeVisible();
    await expect(main.getByText('C190', { exact: true })).toBeVisible();
    await expect(main.locator('ol > li')).toHaveCount(14);
    await expect(main.getByText('Went wrong here')).toHaveCount(3);
    await expect(stage(page, 'Address checked').getByText(/With LateLens.*CONFIRM_ADDRESS/)).toBeVisible();
    await expect(stage(page, 'Carrier chosen').getByText(/With LateLens Carrier [A-E] for Northeast standard: .* vs \d+% for F/)).toBeVisible();
    await expect(stage(page, 'Delivered').getByText('Went wrong here')).toBeVisible();
    await expect(stage(page, 'In transit').getByText('Synthetic data')).toBeVisible();
    await expect(stage(page, 'Approved').getByText('Not done today')).toBeVisible();
    await expect(stage(page, 'Client told').getByText('Not done today')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('D000559: same day ordered after the 08:00 cut-off; LateLens promises next day and says why', async ({ page }) => {
    await open(page, 'delivery:D000559');
    const main = page.locator('main');
    await expect(main.getByText('2 days late').first()).toBeVisible();
    await expect(main.getByText('Went wrong here')).toHaveCount(2);
    const promise = stage(page, 'Promise set');
    await expect(promise.getByText('Went wrong here')).toBeVisible();
    await expect(promise.getByText(/With LateLens Promise \d{4}-\d{2}-\d{2} \(Next day\)\. Received at \d{2}:\d{2}, after the 08:00 pick-list cut-off/)).toBeVisible();
    await expect(stage(page, 'Address checked').getByText('Done')).toBeVisible();
  });
});

test.describe('moving through the workflow', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'checked once, at desktop width');

  test('the ref box and the example buttons open another journey', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'delivery:D000559' }).click();
    await expect(page.getByRole('heading', { name: 'Past delivery D000559' })).toBeVisible();
    const box = page.getByLabel('Order or delivery');
    await box.fill('delivery:D000213');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Past delivery D000213' })).toBeVisible();
    await box.fill('delivery:D000559');
    await box.press('Enter');
    await expect(page.getByRole('heading', { name: 'Past delivery D000559' })).toBeVisible();
  });

  test('an unknown or malformed ref says so instead of showing a journey', async ({ page }) => {
    await open(page, 'delivery:D999999');
    // Scoped to main: Next.js adds its own role=alert route announcer.
    await expect(page.locator('main').getByRole('alert')).toContainText('No order or delivery found for delivery:D999999');
    await expect(page.locator('main ol > li')).toHaveCount(0);
    await open(page, 'order:1');
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
  });
});

test.describe('new orders from the inbox', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'checked once, at desktop width');
  type Inbox = { emails: { id: number; status: string; decision: string | null }[] };
  let inbox: Inbox['emails'] = [];
  // The only call made outside a page: retry it, since one dropped request would otherwise skip every inbox test.
  test.beforeAll(async ({ request }) => {
    for (let attempt = 1; ; attempt++) {
      const res = await request.get(`${API_URL}/api/intake`, { timeout: 30_000 }).catch((e: Error) => e);
      if (!(res instanceof Error) && res.ok()) { inbox = ((await res.json()) as Inbox).emails; return; }
      if (attempt === 3) {
        throw new Error(`Could not load the inbox from ${API_URL}/api/intake: ${res instanceof Error ? res.message : res.status()}`);
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  });

  test('the latest order emails are shortcuts, and open as an order journey with a link back', async ({ page }) => {
    test.skip(inbox.length === 0, 'the inbox is empty');
    await open(page);
    const first = inbox[0].id;
    await page.getByRole('button', { name: `email:${first}` }).click();
    await expect(page.getByRole('heading', { name: `Order email ${first}` })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open in Order emails/ })).toHaveAttribute('href', '/dashboard/intake');
    await expect(stage(page, 'Order received').getByText('Done')).toBeVisible();
    // SEC-JRN-01: the journey carries no sender address, names or contact details.
    await expect(page.locator('main')).not.toContainText('@');
  });

  test('an all-clear order awaiting approval: checks done, waiting at approval, nothing shipped', async ({ page }) => {
    const email = inbox.find((e) => e.decision === 'ALL_CLEAR' && e.status === 'AWAITING_APPROVAL');
    test.skip(!email, 'no all-clear order is awaiting approval in the inbox');
    await open(page, `email:${email!.id}`);
    for (const label of ['Order received', 'Order read', 'Address checked', 'Promise set', 'Warehouse chosen', 'Carrier chosen']) {
      await expect(stage(page, label).getByText('Done'), label).toBeVisible();
    }
    await expect(stage(page, 'Approved').getByText('In progress')).toBeVisible();
    for (const label of ['Entered in WMS', 'Picked', 'Delivered']) {
      await expect(stage(page, label).getByText('Not reached'), label).toBeVisible();
    }
  });

  test('an order waiting for the client to confirm the address stops before the warehouse and carrier', async ({ page }) => {
    const email = inbox.find((e) => e.decision === 'CONFIRM_ADDRESS' && e.status !== 'REJECTED');
    test.skip(!email, 'no order in the inbox is waiting on an address');
    await open(page, `email:${email!.id}`);
    await expect(stage(page, 'Address checked').getByText('In progress')).toBeVisible();
    // The promise date is already known from the order; warehouse and carrier wait for a confirmed address.
    await expect(stage(page, 'Warehouse chosen').getByText('Not reached')).toBeVisible();
    await expect(stage(page, 'Carrier chosen').getByText('Not reached')).toBeVisible();
  });
});

test('phone width: the whole workflow fits the screen and the timeline reads top to bottom', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 768, 'phone layout only');
  const errors = await open(page, 'delivery:D000213');
  await expect(page.locator('main ol > li')).toHaveCount(14);
  await expect(page.getByText('4 days late').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
