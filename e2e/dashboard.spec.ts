import { expect, test } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174';

test('serves liveness without authentication', async ({ request }) => {
  const response = await request.get(`${baseURL}/healthz`);
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: 'ok', service: 'dashboard' });
});

test('renders the anonymous login page', async ({ page }) => {
  const response = await page.goto(`${baseURL}/auth/login`);
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Bookify Dashboard' })).toBeVisible();
  await expect(page.getByText('Đăng nhập để quản lý nền tảng của bạn')).toBeVisible();
});
