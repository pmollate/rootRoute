import { defineConfig, devices } from '@playwright/test';

/**
 * UI automation of the order-to-delivery workflow (Order journey), owner C: deployed app or a local one. From frontend/:
 *   WEB_URL=https://rootroute01-web.azurewebsites.net API_URL=https://rootroute01-api.azurewebsites.net npm run e2e
 * Only the workflow is automated (e2e/journey.spec.ts); other screens rely on their unit tests. Read-only: no test sends,
 * approves or pastes anything. Vitest never picks these up (it only reads components/ and lib/).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
