import { defineConfig, devices } from '@playwright/test';
// Run `pnpm test:e2e:setup` first (fixture catalog + test-mode build).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL: 'http://localhost:8790', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /responsive|mobile/ },
  ],
  webServer: {
    command: 'pnpm exec wrangler dev -c dist/server/wrangler.json --local --persist-to tmp/e2e-state --port 8790',
    url: 'http://localhost:8790/robots.txt',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
