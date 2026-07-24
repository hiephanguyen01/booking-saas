import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionalData } from './optional-data.server.ts';

test('returns the fallback for an ordinary optional-data failure', async () => {
  const result = await optionalData(Promise.reject(new Error('optional section failed')), [] as string[]);
  assert.deepEqual(result, []);
});

test('rethrows request cancellation instead of degrading it', async () => {
  const abort = new DOMException('The request was aborted', 'AbortError');
  await assert.rejects(() => optionalData(Promise.reject(abort), null), abort);
});

test('rethrows infrastructure Responses so the route boundary keeps the 5xx status', async () => {
  const unavailable = new Response('Service unavailable', { status: 503 });
  await assert.rejects(() => optionalData(Promise.reject(unavailable), null), unavailable);
});

test('may degrade an expected client-side Response', async () => {
  const notFound = new Response('Not found', { status: 404 });
  const result = await optionalData(Promise.reject(notFound), null);
  assert.equal(result, null);
});
