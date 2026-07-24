import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readJsonRequestBody } from './json-request.server.ts';

test('returns parsed JSON bodies', async () => {
  const result = await readJsonRequestBody(
    new Request('https://storefront.invalid/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Partner' }),
    }),
  );

  assert.deepEqual(result, { ok: true, value: { name: 'Partner' } });
});

test('classifies malformed JSON as a client error', async () => {
  const result = await readJsonRequestBody(
    new Request('https://storefront.invalid/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":',
    }),
  );

  assert.deepEqual(result, { ok: false, code: 'INVALID_JSON' });
});

test('rethrows non-syntax failures', async () => {
  const failure = new Error('stream failed');
  await assert.rejects(
    readJsonRequestBody({ json: () => Promise.reject(failure) }),
    (error) => error === failure,
  );
});
