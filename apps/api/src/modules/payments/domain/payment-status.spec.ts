import { describe, expect, it } from 'vitest';
import { amountMatches, canSucceed, publicPaymentStatus } from './payment-status';

describe('payment status (§11.2)', () => {
  it('only a pending payment can transition to succeeded', () => {
    expect(canSucceed('pending')).toBe(true);
    expect(canSucceed('succeeded')).toBe(false); // terminal — duplicate webhooks are no-ops
    expect(canSucceed('failed')).toBe(false);
    expect(canSucceed('expired')).toBe(false);
  });

  it('rejects an underpayment but accepts exact/over payment', () => {
    expect(amountMatches(300_000n, 299_999n)).toBe(false);
    expect(amountMatches(300_000n, 300_000n)).toBe(true);
    expect(amountMatches(300_000n, 400_000n)).toBe(true);
  });

  it('exposes the latest terminal gateway status to the storefront', () => {
    expect(publicPaymentStatus(null)).toBe('none');
    expect(publicPaymentStatus('pending')).toBe('pending');
    expect(publicPaymentStatus('succeeded')).toBe('succeeded');
    expect(publicPaymentStatus('failed')).toBe('failed');
    expect(publicPaymentStatus('expired')).toBe('expired');
  });
});
