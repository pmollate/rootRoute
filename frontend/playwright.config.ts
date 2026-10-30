import { defineConfig, devices } from '@playwright/test';
import { WORKFLOW_ROLE, authFile, signedIn } from './e2e/session';

/**
 * P6 (owner C): smoke test of the deployed app (or a local one). Run from frontend/:
 *   WEB_URL=https://rootroute01-web.azurewebsites.net API_URL=https://rootroute01-api.azurewebsites.net npm run e2e
 * Read-only: no test sends, approves or pastes anything. Vitest never picks these up (it only reads components/ and lib/).
 *
 * P7 (NFR-AUTH-04): with E2E_DEMO_PASSWORD set, the `setup` project signs in once per demo role (e2e/auth.setup.ts),
 * the screen and workflow tests run signed in as admin, and `roles` runs one refusal per role (e2e/roles.spec.ts).
 * Without it nobody signs in and everything runs anonymously, as before P7 (AUTH_REQUIRED=off, the local default).
 */
const viewportPhone = { width: 375, height: 812 };
const viewportDesktop = { width: 1280, height: 800 };
// Signed in, a trace would hold the session cookie, and the report is uploaded: keep screenshots, drop traces.
const signedInUse = signedIn
  ? { storageState: authFile(WORKFLOW_ROLE), trace: 'off' as const, screenshot: 'only-on-failure' as const }
  : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    // Typing the password must leave nothing behind: no trace, screenshot or video of the sign-in.
    { name: 'setup', testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: viewportDesktop, trace: 'off', screenshot: 'off', video: 'off' } },
    { name: 'phone', testIgnore: /roles\.spec\.ts/, dependencies: ['setup'],
      use: { ...devices['Pixel 7'], viewport: viewportPhone, ...signedInUse } },
    { name: 'desktop', testIgnore: /roles\.spec\.ts/, dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: viewportDesktop, ...signedInUse } },
    // Each refusal test picks its own role's session (test.use in the spec).
    { name: 'roles', testMatch: /roles\.spec\.ts/, dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: viewportDesktop, ...(signedIn ? { trace: 'off' as const, screenshot: 'only-on-failure' as const } : {}) } },
  ],
});
