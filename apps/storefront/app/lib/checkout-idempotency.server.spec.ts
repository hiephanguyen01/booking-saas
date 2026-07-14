import { describe, expect, it } from 'vitest';
import { buildCheckoutIdempotencyKey } from './checkout-idempotency.server';

const base = {
  tenantId: 'tenant-1',
  listingId: 'listing-1',
  mode: 'daily',
  start: '2026-08-01T00:00:00.000Z',
  end: '2026-08-02T00:00:00.000Z',
  quantity: 1,
  promoCode: null,
  email: 'Guest@Example.com ',
  phone: '0900000000',
};

describe('buildCheckoutIdempotencyKey', () => {
  it('is stable for equivalent normalized input', () => {
    expect(buildCheckoutIdempotencyKey(base)).toBe(
      buildCheckoutIdempotencyKey({ ...base, email: 'guest@example.com' }),
    );
  });

  it.each([
    { end: '2026-08-03T00:00:00.000Z' },
    { quantity: 2 },
    { promoCode: 'SUMMER' },
    { tenantId: 'tenant-2' },
  ])('changes when booking identity changes: %o', (change) => {
    expect(buildCheckoutIdempotencyKey({ ...base, ...change })).not.toBe(
      buildCheckoutIdempotencyKey(base),
    );
  });
});
