// E19 (SPEC §5.17): the client's /confirm/{token} page on a running app. Skipped unless CONFIRM_TOKEN holds a fresh link
// minted on a test environment with CONFIRM_LINK=on (send a CONFIRM_ADDRESS reply to an allow-listed test address and copy
// the token from the received email). Never posts Confirm: that would use the link. Every request here is anonymous
// (a fresh context with no stored session), as a client opening the email would be.
import { expect, test, type Browser } from '@playwright/test';

const TOKEN = process.env.CONFIRM_TOKEN ?? '';
const INVALID = 'This link is no longer valid. Please reply to our email with the delivery address.';
/** A random token of the right shape (43 base64url characters), which no link has. */
const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const anonymous = (browser: Browser, phone = false) => browser.newContext({
  storageState: { cookies: [], origins: [] }, baseURL: test.info().project.use.baseURL,
  ...(phone ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : {}),
});

test.describe('address link page (E19)', () => {
  test.skip(!TOKEN, 'set CONFIRM_TOKEN to a fresh link from a CONFIRM_LINK=on test environment');
  // One project is enough: the link's per-IP limit is 10 requests a minute (SEC-LINK-04).
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'phone', 'runs once, in the phone project'); });

  test('AC-NFR-LINK-01: at 375 × 812 the page fits the screen and the pin can be dragged by touch', async ({ browser }) => {
    const ctx = await anonymous(browser, true);
    const page = await ctx.newPage();
    await page.goto(`/confirm/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Confirm your delivery address' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    const pin = page.locator('.maplibregl-marker').first();
    await expect(pin).toBeVisible();
    const before = await pin.boundingBox();
    const x = before!.x + before!.width / 2;
    const y = before!.y + before!.height / 2;
    // A touch drag: start on the pin, move, lift (CDP touch events, as a phone sends them).
    const cdp = await ctx.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px: number, py: number) => cdp.send('Input.dispatchTouchEvent',
      { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] });
    await touch('touchStart', x, y);
    for (let i = 1; i <= 5; i += 1) await touch('touchMove', x + 8 * i, y + 6 * i);
    await touch('touchEnd', x + 40, y + 30);
    const after = await pin.boundingBox();
    expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(20);
    await ctx.close();
  });

  test('AC-SEC-LINK-07: the page is sent with frame-ancestors none and no referrer', async ({ browser }) => {
    const ctx = await anonymous(browser);
    const res = await (await ctx.newPage()).goto(`/confirm/${TOKEN}`);
    expect(res!.status()).toBe(200);
    expect(res!.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res!.headers()['referrer-policy']).toBe('no-referrer');
    await ctx.close();
  });

  test('AC-SEC-LINK-05: with no session the link page loads without a redirect; /dashboard and /confirmx do not', async ({ browser }) => {
    const ctx = await anonymous(browser);
    const page = await ctx.newPage();
    await page.goto(`/confirm/${TOKEN}`);
    expect(new URL(page.url()).pathname).toBe(`/confirm/${TOKEN}`);
    // With AUTH_REQUIRED=on (detected as in roles.spec.ts: /dashboard redirects to sign-in) /confirmx is sent to sign-in
    // too; with it off /dashboard opens by design (REQ-AUTH-13) and /confirmx is simply not a page.
    const dash = await ctx.request.get('/dashboard', { maxRedirects: 0 });
    const confirmx = await ctx.request.get('/confirmx', { maxRedirects: 0 });
    const toLogin = (r: typeof dash) => r.status() >= 300 && r.status() < 400 && (r.headers().location ?? '').includes('/login');
    if (toLogin(dash)) expect(toLogin(confirmx)).toBe(true);
    else expect(confirmx.status()).toBe(404);
    await ctx.close();
  });

  test('AC-LINK-07: a random token shows the invalid-link text with status 404', async ({ browser }) => {
    const ctx = await anonymous(browser);
    const page = await ctx.newPage();
    const res = await page.goto(`/confirm/${randomToken()}`);
    expect(res!.status()).toBe(404);
    await expect(page.getByText(INVALID)).toBeVisible();
    await ctx.close();
  });
});
