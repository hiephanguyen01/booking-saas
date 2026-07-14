import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  workers: ci ? 1 : undefined,
  reporter: ci ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fixtures/fake-backend.mjs',
      url: 'http://127.0.0.1:4010/healthz',
      reuseExistingServer: !ci,
    },
    {
      command: 'pnpm --filter @booking/storefront dev',
      url: 'http://127.0.0.1:4173/healthz',
      reuseExistingServer: !ci,
      env: {
        ...process.env,
        STOREFRONT_PORT: '4173',
        HOST: '127.0.0.1',
        BACKEND_URL: 'http://127.0.0.1:4010',
      },
    },
    {
      command: 'pnpm --filter @booking/dashboard dev',
      url: 'http://127.0.0.1:4174/healthz',
      reuseExistingServer: !ci,
      env: {
        ...process.env,
        DASHBOARD_PORT: '4174',
        HOST: '127.0.0.1',
        BACKEND_URL: 'http://127.0.0.1:4010',
        REDIS_URL: 'redis://127.0.0.1:6399',
        SESSION_SECRET_CURRENT: 'e2e-session-secret-that-is-at-least-32-characters',
        SESSION_COOKIE_SECURE: 'false',
      },
    },
  ],
});
