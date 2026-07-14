import { expect, test } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

test('redirects legacy home to localized SSR page with SEO links', async ({ page }) => {
  const response = await page.goto(`${baseURL}/`);
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(`${baseURL}/vi`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page).toHaveTitle('Bookify E2E Studio');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/vi`);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    `${baseURL}/en`,
  );
});

test('renders English from the URL without relying on browser state', async ({ page }) => {
  const response = await page.goto(`${baseURL}/en`);
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('returns a real 404 for an unknown catalog type', async ({ page }) => {
  const response = await page.goto(`${baseURL}/vi/t/not-found`);
  expect(response?.status()).toBe(404);
});
