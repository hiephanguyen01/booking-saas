import { describe, expect, it } from 'vitest';
import { violatesTenantShareFloor, type CommissionRateGuardInput } from './commission-rate-guard';

const base: CommissionRateGuardInput = {
  tenantRateType: 'percent',
  tenantRate: 15n,
  platformRate: 2,
  affiliateRateType: 'percent',
  affiliateRate: 5n,
  isHouse: false,
};

describe('violatesTenantShareFloor (§3.3 Risk #5)', () => {
  it('§3.3 example rates (2 + 5 ≤ 15) are valid', () => {
    expect(violatesTenantShareFloor(base)).toBe(false);
  });

  it('platform% + affiliate% == tenant% is on the boundary and allowed', () => {
    expect(violatesTenantShareFloor({ ...base, tenantRate: 7n })).toBe(false); // 2 + 5 == 7
  });

  it('platform% + affiliate% > tenant% is blocked', () => {
    expect(violatesTenantShareFloor({ ...base, tenantRate: 6n })).toBe(true); // 2 + 5 > 6
  });

  it('is waived entirely for a house partner even when rates would go negative', () => {
    expect(violatesTenantShareFloor({ ...base, tenantRate: 1n, isHouse: true })).toBe(false);
  });

  it('is not assessable when the tenant rate is fixed (needs the booking amount)', () => {
    expect(violatesTenantShareFloor({ ...base, tenantRateType: 'fixed', tenantRate: 1n })).toBe(false);
  });

  it('is not assessable when the affiliate rate is fixed', () => {
    expect(violatesTenantShareFloor({ ...base, affiliateRateType: 'fixed', affiliateRate: 999_999n })).toBe(false);
  });

  it('a zero-affiliate rule only needs platform% ≤ tenant%', () => {
    expect(violatesTenantShareFloor({ ...base, affiliateRate: 0n, platformRate: 20, tenantRate: 15n })).toBe(true);
    expect(violatesTenantShareFloor({ ...base, affiliateRate: 0n, platformRate: 10, tenantRate: 15n })).toBe(false);
  });
});
