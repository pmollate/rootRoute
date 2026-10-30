// P7 (owner C, NFR-AUTH-04, AC-NFR-AUTH-04): one refusal per role. Signed in as the role (auth.setup.ts), a dashboard
// screen outside its page matrix answers 403 with the forbidden page and keeps the URL (REQ-AUTH-15, AC-AUTH-15), and
// an API call it may not make answers 403 `forbidden` through the web app's /api proxy (REQ-AUTH-05, -06, -16).
// Pages and calls come from refusals.ts, which lib/auth/refusals.test.ts checks against PAGE_ROLES and permissions.ts.
// Read-only: no test approves, sends, pastes or writes anything.
import { expect, test } from '@playwright/test';
import { REFUSALS } from './refusals';
import { authFile, signedIn } from './session';

test.skip(!signedIn, 'E2E_DEMO_PASSWORD is not set: nobody signs in, so there is no role to refuse');

// Refusals exist only where sign-in is enforced. An app still on AUTH_REQUIRED=off (SPEC-auth §10 steps 1-2) lets
// every role through by design (REQ-AUTH-13), so there the tests skip and say why rather than fail.
let enforced = false;
test.beforeAll(async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const res = await anon.get('/dashboard/overview', { maxRedirects: 0 });
  enforced = res.status() >= 300 && res.status() < 400 && (res.headers().location ?? '').includes('/login');
  await anon.dispose();
});

for (const r of REFUSALS) {
  test.describe(r.role, () => {
    test.use({ storageState: authFile(r.role) });

    test(`${r.role} is refused ${r.page ?? 'an unlisted intake action'} and ${r.api.method} ${r.api.path} (AC-NFR-AUTH-04)`,
      async ({ page, baseURL }) => {
        test.skip(!enforced, 'the app does not enforce sign-in (AUTH_REQUIRED=off), so it refuses no role');
        if (r.page) {
          const res = await page.goto(r.page);
          expect(res?.status(), `${r.page} for ${r.role}`).toBe(403);
          await expect(page.getByRole('heading', { level: 1, name: 'This page is not available for your role' })).toBeVisible();
          expect(new URL(page.url()).pathname, 'the URL stays as typed').toBe(r.page);
        }
        // page.request carries this role's session cookie, as the browser's own calls do.
        const res = r.api.method === 'GET'
          ? await page.request.get(r.api.path)
          : await page.request.post(r.api.path, { data: r.api.body, headers: { origin: new URL(baseURL!).origin } });
        // 403 forbidden, not 401: the session is valid and the role is what is refused.
        expect(res.status(), `${r.api.method} ${r.api.path} for ${r.role}`).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden' });
      });
  });
}
