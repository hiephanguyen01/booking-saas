import assert from 'node:assert/strict';
import test from 'node:test';

import { paymentPollDelay, runPaymentPollLoad } from './payment-polling';

test('payment polling uses the expected bounded backoff curve', () => {
  assert.equal(paymentPollDelay(0), 3_000);
  assert.equal(paymentPollDelay(5), 5_000);
  assert.equal(paymentPollDelay(11), 10_000);
  assert.equal(paymentPollDelay(17), 30_000);
});

test('payment polling contains synchronous load failures', async () => {
  await assert.doesNotReject(
    runPaymentPollLoad(() => {
      throw new Error('sync failure');
    }, '/payment-status'),
  );
});

test('payment polling contains rejected load promises', async () => {
  await assert.doesNotReject(
    runPaymentPollLoad(() => Promise.reject(new Error('async failure')), '/payment-status'),
  );
});
