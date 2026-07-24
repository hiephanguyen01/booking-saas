import assert from 'node:assert/strict';
import test from 'node:test';

import { isBookingAccessNavigation } from './booking-access-navigation';

function navigation(state: 'idle' | 'loading' | 'submitting', intent?: string) {
  const formData = new FormData();
  if (intent) formData.set('intent', intent);
  return { state, formMethod: intent ? 'POST' : undefined, formData };
}

test('booking access stays pending through submit and redirect loading', () => {
  assert.equal(isBookingAccessNavigation(navigation('submitting', 'verify-access')), true);
  assert.equal(isBookingAccessNavigation(navigation('loading', 'verify-access')), true);
});

test('booking access ignores idle and unrelated submissions', () => {
  assert.equal(isBookingAccessNavigation(navigation('idle', 'verify-access')), false);
  assert.equal(isBookingAccessNavigation(navigation('submitting', 'checkout')), false);
  assert.equal(isBookingAccessNavigation(navigation('loading')), false);
});
