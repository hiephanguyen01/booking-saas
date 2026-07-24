import assert from 'node:assert/strict';
import test from 'node:test';

import { isCheckoutNavigation } from './checkout-submission-state';

function navigation(state: 'idle' | 'loading' | 'submitting', intent?: string) {
  const formData = new FormData();
  if (intent) formData.set('intent', intent);
  return { state, formMethod: intent ? 'POST' : undefined, formData };
}

test('checkout navigation remains pending through submit and redirect loading', () => {
  assert.equal(isCheckoutNavigation(navigation('submitting', 'checkout')), true);
  assert.equal(isCheckoutNavigation(navigation('loading', 'checkout')), true);
});

test('checkout navigation ignores idle and unrelated form submissions', () => {
  assert.equal(isCheckoutNavigation(navigation('idle', 'checkout')), false);
  assert.equal(isCheckoutNavigation(navigation('submitting', 'pay')), false);
  assert.equal(isCheckoutNavigation(navigation('loading')), false);
});
