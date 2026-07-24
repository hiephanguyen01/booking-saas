import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCheckoutIdempotencyKey,
  createCheckoutAttemptId,
  parseCheckoutAttemptId,
} from './checkout-idempotency.server.ts';

test('creates and validates canonical checkout attempt identifiers', () => {
  const attemptId = createCheckoutAttemptId();
  assert.equal(parseCheckoutAttemptId(attemptId), attemptId);
  assert.equal(parseCheckoutAttemptId(attemptId.toUpperCase()), attemptId);
  assert.equal(parseCheckoutAttemptId('not-an-attempt'), null);
  assert.equal(parseCheckoutAttemptId(null), null);
});

test('keeps retries in one attempt stable while separating new attempts', () => {
  const tenantId = 'tenant-1';
  const firstAttempt = createCheckoutAttemptId();
  const secondAttempt = createCheckoutAttemptId();
  const firstKey = buildCheckoutIdempotencyKey({ tenantId, attemptId: firstAttempt });

  assert.equal(
    buildCheckoutIdempotencyKey({ tenantId, attemptId: firstAttempt }),
    firstKey,
  );
  assert.notEqual(
    buildCheckoutIdempotencyKey({ tenantId, attemptId: secondAttempt }),
    firstKey,
  );
  assert.notEqual(
    buildCheckoutIdempotencyKey({ tenantId: 'tenant-2', attemptId: firstAttempt }),
    firstKey,
  );
});
