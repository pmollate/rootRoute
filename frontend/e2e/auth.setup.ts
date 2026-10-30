// P7 (owner C, NFR-AUTH-04): signs in once per role through the real /login form and saves each session to
// e2e/.auth/<role>.json (gitignored) for the workflow and refusal tests. Runs as the `setup` project, with trace,
// screenshots and video off, so neither the password nor a session cookie lands in the report.
// Without E2E_DEMO_PASSWORD every test here skips and writes nothing: the suite then runs anonymously, as before P7,
// which is what an AUTH_REQUIRED=off app (the local default) expects.
import { expect, test as setup } from '@playwright/test';
import { ROLES, authFile, demoEmail, signedIn } from './session';

setup.skip(!signedIn, 'E2E_DEMO_PASSWORD is not set: nobody signs in and the suite runs anonymously');

for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/login?next=/dashboard/overview');
    await page.locator('input[name="email"]').fill(demoEmail(role));
    // Not fill(): Playwright writes a fill's value into the step title, and the HTML report shows step titles.
    await page.locator('input[name="password"]').evaluate((el, v) => { (el as HTMLInputElement).value = v; },
      process.env.E2E_DEMO_PASSWORD ?? '');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // A refused sign-in stays on /login with "Sign-in failed" (or "Too many attempts") in an alert.
    // The pathname, not the whole URL: /login?next=/dashboard/overview ends the same way.
    await expect(page, `demo sign-in for ${demoEmail(role)} did not reach the dashboard`)
      .toHaveURL((url) => url.pathname === '/dashboard/overview');
    // The session is this role and nothing else, so each refusal test runs as the role it names.
    const session = (await (await page.request.get('/api/auth/session')).json()) as { user?: { roles?: string[] } };
    expect(session.user?.roles).toEqual([role]);
    await page.context().storageState({ path: authFile(role) });
  });
}
