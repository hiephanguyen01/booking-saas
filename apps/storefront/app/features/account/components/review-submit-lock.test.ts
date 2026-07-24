import assert from 'node:assert/strict';
import test from 'node:test';

import { createSubmissionLock } from './review-submit-lock';

test('submission lock allows only one in-flight attempt', () => {
  const lock = createSubmissionLock();

  assert.equal(lock.tryAcquire(), true);
  assert.equal(lock.tryAcquire(), false);

  lock.release();
  assert.equal(lock.tryAcquire(), true);
});

test('submission lock can be released after an aborted attempt', () => {
  const lock = createSubmissionLock();

  assert.equal(lock.tryAcquire(), true);
  lock.release();
  assert.equal(lock.tryAcquire(), true);
});
