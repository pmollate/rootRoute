// UI automation of the order-to-delivery workflow (Order journey, D9, docs/SPEC-order-workflow.md), owner C.
// The journey is a hub map: seven places an order passes, each opening its stages beside it, and a With Root Route switch.
// Read-only: nothing here sends, approves or pastes. Past deliveries are fixed rows of the supplied data; order emails
// are read from the inbox the app shows. Every call goes through the web app's same-origin /api proxy.
import { expect, test, type Locator, type Page } from '@playwright/test';

const JOURNEY = '/dashboard/journey';

/** Opens the journey page for a ref and collects page errors and /api 5xx answers. */
async function open(page: Page, ref?: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(ref ? `${JOURNEY}?ref=${ref}` : JOURNEY);
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 }).or(main.getByRole('alert'))).toBeVisible();
  return errors;
}
const h1 = (page: Page) => page.locator('main').getByRole('heading', { level: 1 });
const lead = (page: Page) => page.locator('main header p');
const map = (page: Page) => page.locator('main').getByRole('region', { name: 'Journey map' });
/** A place on the map; its accessible name is its tag, its title and the note under it. */
const place = (page: Page, title: string) => map(page).getByRole('button', { name: new RegExp(title) });
/** Opens a place and returns its stages panel; Escape first closes any open panel, which can cover another place. */
async function stagesOf(page: Page, title: string): Promise<Locator> {
  await page.keyboard.press('Escape');
  await place(page, title).click();
  return page.locator('main').getByRole('group', { name: new RegExp(`${title}: stages`) });
}
/** One stage row in an open panel, by its label. */
const row = (panel: Locator, label: string) => panel.locator('li').filter({ has: panel.page().getByText(label, { exact: true }) });

test.describe('past delivery: where it went wrong, and what Root Route would do', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'checked once, at desktop width');

  test('D000213 (default): incomplete address and a slow carrier lane, 4 days late', async ({ page }) => {
    const errors = await open(page);
    await expect(h1(page)).toHaveText(/four days after the promise\.$/);
    await expect(lead(page)).toContainText('Two decisions caused it: the order went ahead with an incomplete address');
    await expect(lead(page)).toContainText('No promise confirmation or delay notice was sent to the client.');
    await expect(place(page, 'Order intake')).toContainText('Address incomplete, went ahead');
    await expect(place(page, 'Planning')).toContainText('on a late lane');

    const intake = await stagesOf(page, 'Order intake');
    await expect(row(intake, 'Address checked')).toContainText('Went wrong here');
    await expect(row(intake, 'Order received')).toContainText('Done');
    const plan = await stagesOf(page, 'Planning');
    await expect(row(plan, 'Carrier chosen')).toContainText('Went wrong here');
    await expect(row(plan, 'Approved')).toContainText('Not done today');
    await expect(row(await stagesOf(page, 'Last mile'), 'In transit')).toContainText('Synthetic data');
    await expect(row(await stagesOf(page, 'Delivery address'), 'Delivered')).toContainText('Went wrong here');
    expect(errors).toEqual([]);
  });

  test('D000213 with Root Route: the address is confirmed first and the lane goes to a better carrier', async ({ page }) => {
    await open(page, 'delivery:D000213');
    const toggle = page.getByRole('switch', { name: 'With Root Route' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(h1(page)).toHaveText('The same order, with Root Route’s two decisions.');
    await expect(place(page, 'Order intake')).toContainText('Address confirmed first');
    await expect(place(page, 'Planning')).toContainText(/Carrier [A-F], [+−]\$[\d.]+ \/ shipment/);

    const intake = await stagesOf(page, 'Order intake');
    await expect(row(intake, 'Address checked')).toContainText('Changed by Root Route');
    await expect(row(intake, 'Address checked')).toContainText('CONFIRM_ADDRESS');
    await expect(row(await stagesOf(page, 'Planning'), 'Carrier chosen'))
      .toContainText(/Carrier [A-F] for Northeast standard: \d+% on time vs \d+% for F/);
    // Off again: back to what happened.
    await toggle.click();
    await expect(h1(page)).toHaveText(/four days after the promise\.$/);
  });

  test('D000559: same day ordered after the 08:00 cut-off; Root Route promises next day and says why', async ({ page }) => {
    await open(page, 'delivery:D000559');
    await expect(h1(page)).toHaveText(/two days after the promise\.$/);
    await expect(lead(page)).toContainText('One decision caused it: a same-day promise was made after the 08:00 cut-off.');
    await expect(place(page, 'Planning')).toContainText('Same-day promise after the cut-off');
    await expect(row(await stagesOf(page, 'Order intake'), 'Address checked')).toContainText('Done');

    await page.getByRole('switch', { name: 'With Root Route' }).click();
    await expect(place(page, 'Planning')).toContainText(/Promised \d{1,2} [A-Z][a-z]{2}/);
    await expect(lead(page)).toContainText('as the order missed the 08:00 cut-off');
    const promise = row(await stagesOf(page, 'Planning'), 'Promise set');
    await expect(promise).toContainText('Changed by Root Route');
    await expect(promise).toContainText(/Promise \d{4}-\d{2}-\d{2} \(Next day\)\. Received at \d{2}:\d{2}, after the 08:00 pick-list cut-off/);
  });
});

test.describe('moving through the workflow', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'checked once, at desktop width');

  test('the order list and the delivery ID box open another journey', async ({ page }) => {
    await open(page);
    const order = page.getByLabel('Order', { exact: true });
    await order.selectOption('delivery:D000559');
    await expect(h1(page)).toHaveText(/two days after the promise\.$/);

    await order.selectOption('other');
    const box = page.getByLabel('Delivery ID');
    const inspect = page.getByRole('button', { name: 'Inspect', exact: true });
    await box.fill('not an id');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(inspect).toBeDisabled();
    await box.fill('213');
    await inspect.click();
    await expect(h1(page)).toHaveText(/four days after the promise\.$/);
    await box.fill('D000559');
    await box.press('Enter');
    await expect(h1(page)).toHaveText(/two days after the promise\.$/);
  });

  test('an unknown ref says so instead of showing a journey', async ({ page }) => {
    await open(page, 'delivery:D999999');
    // Scoped to main: Next.js adds its own role=alert route announcer.
    await expect(page.locator('main').getByRole('alert')).toContainText('No delivery found with ID D999999');
    await expect(map(page)).toHaveCount(0);
    await open(page, 'order:1');
    await expect(page.locator('main').getByRole('alert')).toContainText('No order found for order:1');
  });
});

test.describe('new orders from the inbox', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'checked once, at desktop width');
  type Inbox = { emails: { id: number; status: string; decision: string | null; inReplyTo: number | null }[] };
  let inbox: Inbox['emails'] = [];
  /**
   * An email's journey takes in the client's answers to it, so an answered email shows its answer's state (an approved
   * answer marks Approved done). The status checks pick only emails nobody has answered: the newest of each conversation,
   * the one the picker opens.
   */
  const unanswered = () => inbox.filter((e) => !inbox.some((r) => r.inReplyTo === e.id));
  // Read through the web app, as the page does; retried, since one dropped request would skip every inbox test.
  test.beforeAll(async ({ request }) => {
    for (let attempt = 1; ; attempt++) {
      const res = await request.get('/api/intake', { timeout: 30_000 }).catch((e: Error) => e);
      if (!(res instanceof Error) && res.ok()) { inbox = ((await res.json()) as Inbox).emails; return; }
      if (attempt === 3) throw new Error(`Could not load the inbox from /api/intake: ${res instanceof Error ? res.message : res.status()}`);
      await new Promise((r) => setTimeout(r, 2_000));
    }
  });

  test('the latest order emails are in the order list and open as an order journey', async ({ page }) => {
    test.skip(inbox.length === 0, 'the inbox is empty');
    await open(page);
    const first = inbox[0];
    await page.getByLabel('Order', { exact: true }).selectOption(`email:${first.id}`);
    await expect(h1(page)).toHaveText(/: \w+ of 14 steps done\.$|: \d+ of 14 steps done\.$/);
    await expect(page.locator('main header')).toContainText(`Email ${first.id}`);
    await expect(lead(page)).toContainText('Stages 9 to 13 come from the simulated WMS and carriers: synthetic data.');
    // Root Route's rules are replayed on past deliveries only.
    await expect(page.getByRole('switch', { name: 'With Root Route' })).toHaveCount(0);
    await expect(row(await stagesOf(page, 'Order intake'), 'Order received')).toContainText('Done');
    // SEC-JRN-01: the journey carries no sender address, names or contact details.
    await expect(page.locator('main')).not.toContainText('@');
  });

  test('an all-clear order awaiting approval: checks done, waiting at approval, nothing shipped', async ({ page }) => {
    const email = unanswered().find((e) => e.decision === 'ALL_CLEAR' && e.status === 'AWAITING_APPROVAL');
    test.skip(!email, 'no all-clear order is awaiting approval in the inbox');
    await open(page, `email:${email!.id}`);
    await expect(place(page, 'Planning')).toContainText('In progress: approved');
    const intake = await stagesOf(page, 'Order intake');
    for (const label of ['Order received', 'Order read', 'Address checked']) await expect(row(intake, label), label).toContainText('Done');
    const plan = await stagesOf(page, 'Planning');
    for (const label of ['Promise set', 'Warehouse chosen', 'Carrier chosen']) await expect(row(plan, label), label).toContainText('Done');
    await expect(row(plan, 'Approved')).toContainText('In progress');
    const wh = await stagesOf(page, 'Warehouse');
    for (const label of ['Entered in WMS', 'Picked']) await expect(row(wh, label), label).toContainText('Not reached');
    await expect(row(await stagesOf(page, 'Delivery address'), 'Delivered')).toContainText('Not reached');
  });

  test('an order waiting for the client to confirm the address stops before the warehouse and carrier', async ({ page }) => {
    const email = unanswered().find((e) => e.decision === 'CONFIRM_ADDRESS' && e.status !== 'REJECTED');
    test.skip(!email, 'no order in the inbox is waiting on an address');
    await open(page, `email:${email!.id}`);
    await expect(row(await stagesOf(page, 'Order intake'), 'Address checked')).toContainText('In progress');
    // The promise date is already known from the order; warehouse and carrier wait for a confirmed address.
    const plan = await stagesOf(page, 'Planning');
    for (const label of ['Warehouse chosen', 'Carrier chosen']) await expect(row(plan, label), label).toContainText('Not reached');
  });
});

test('phone width: the journey fits the screen and a place opens its stages', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 768, 'phone layout only');
  const errors = await open(page, 'delivery:D000213');
  await expect(h1(page)).toHaveText(/four days after the promise\.$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
  await expect(row(await stagesOf(page, 'Order intake'), 'Address checked')).toContainText('Went wrong here');
  expect(errors).toEqual([]);
});
