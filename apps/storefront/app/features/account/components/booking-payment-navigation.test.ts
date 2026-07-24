import assert from 'node:assert/strict';
import test from 'node:test';

import { isBookingPaymentNavigation } from './booking-payment-navigation';

test('payment navigation stays pending through submit and redirect loading', () => {
  const formData = new FormData();
  formData.set('intent', 'pay');

  assert.equal(
    isBookingPaymentNavigation({ state: 'submitting', formMethod: 'POST', formData }),
    true,
  );
  assert.equal(
    isBookingPaymentNavigation({ state: 'loading', formMethod: 'POST', formData }),
    true,
  );
});

test('payment navigation ignores idle and unrelated forms', () => {
  const formData = new FormData();
  formData.set('intent', 'cancel');

  assert.equal(isBookingPaymentNavigation({ state: 'idle' }), false);
  assert.equal(
    isBookingPaymentNavigation({ state: 'submitting', formMethod: 'POST', formData }),
    false,
  );
});
