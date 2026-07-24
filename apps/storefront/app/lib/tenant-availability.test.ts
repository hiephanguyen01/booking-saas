import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tenantUnavailableResponse } from './tenant-availability.ts';

test('allows a live tenant to continue', () => {
  const response = tenantUnavailableResponse(new Request('https://studio.example/vi'), {
    live: true,
    name: 'StudioHub',
  });

  assert.equal(response, null);
});

test('returns a localized English 423 response for a suspended tenant', async () => {
  const response = tenantUnavailableResponse(new Request('https://studio.example/en/l/listing-1'), {
    live: false,
    name: 'StudioHub',
  });

  assert.ok(response);
  assert.equal(response.status, 423);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-language'), 'en');
  assert.deepEqual(await response.json(), {
    code: 'TENANT_UNAVAILABLE',
    tenantName: 'StudioHub',
    locale: 'en',
    message: 'This storefront is currently unavailable. Please try again later.',
  });
});

test('defaults suspended tenant responses to Vietnamese', async () => {
  const response = tenantUnavailableResponse(new Request('https://studio.example/unknown'), {
    live: false,
    name: 'StudioHub',
  });

  assert.ok(response);
  assert.equal(response.headers.get('content-language'), 'vi');
  assert.deepEqual(await response.json(), {
    code: 'TENANT_UNAVAILABLE',
    tenantName: 'StudioHub',
    locale: 'vi',
    message: 'Cửa hàng hiện đang tạm ngưng hoạt động. Vui lòng quay lại sau.',
  });
});
