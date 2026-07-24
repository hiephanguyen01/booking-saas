import assert from 'node:assert/strict';
import test from 'node:test';

import { isFormNavigationPending, otpSubmissionIntent } from './otp-submission-state';

test('submission state distinguishes verify and resend intents', () => {
  const verifyData = new FormData();
  verifyData.set('code', 'sample');
  const resendData = new FormData();
  resendData.set('intent', 'resend');

  assert.equal(
    otpSubmissionIntent({ state: 'submitting', formMethod: 'POST', formData: verifyData }),
    'verify',
  );
  assert.equal(
    otpSubmissionIntent({ state: 'submitting', formMethod: 'POST', formData: resendData }),
    'resend',
  );
});

test('form submission stays pending through redirect loading', () => {
  assert.equal(isFormNavigationPending({ state: 'loading', formMethod: 'POST' }), true);
  assert.equal(otpSubmissionIntent({ state: 'idle' }), 'idle');
});
