import { describe, expect, it } from 'vitest';
import { evaluateTenantShareRisk, type TenantShareRiskInput } from './tenant-share-risk';

const base: TenantShareRiskInput = {
  fundedBy: 'tenant',
  discountType: 'percent',
  discountValue: 5,
  tenantRateType: 'percent',
  tenantRate: 15,
  platformRate: 2,
  affiliateRateType: 'percent',
  affiliateRate: 5,
};

describe('evaluateTenantShareRisk (§12.4)', () => {
  it('§12.4 example (5% discount, 15% tenant, 2% platform, 5% affiliate) stays positive → ok', () => {
    expect(evaluateTenantShareRisk(base).decision).toBe('ok');
  });

  it('blocks when the tenant share is certain to go negative', () => {
    // t=10 < d+p+a=12 and even the exact threshold trips → block.
    expect(evaluateTenantShareRisk({ ...base, tenantRate: 10 }).decision).toBe('block');
  });

  it('warns in the approximation band (sum > tenant but not certain to go negative)', () => {
    // d=10, p=5, a=5 → sum=20; exact threshold = 100*20 − 10*10 = 1900.
    // tenantRate=19 → 1900 < 1900 is false (not block); 19 < 20 is true → warn.
    expect(evaluateTenantShareRisk({ ...base, discountValue: 10, platformRate: 5, affiliateRate: 5, tenantRate: 19 }).decision).toBe('warn');
  });

  it('a partner-funded discount never risks the tenant share → ok', () => {
    expect(evaluateTenantShareRisk({ ...base, fundedBy: 'partner', tenantRate: 1 }).decision).toBe('ok');
  });

  it('a fixed discount cannot be assessed on rates alone → ok', () => {
    expect(evaluateTenantShareRisk({ ...base, discountType: 'fixed', discountValue: 5_000_000, tenantRate: 1 }).decision).toBe('ok');
  });

  it('a fixed tenant/affiliate rate cannot be assessed on rates alone → ok', () => {
    expect(evaluateTenantShareRisk({ ...base, affiliateRateType: 'fixed', affiliateRate: 999_999, tenantRate: 1 }).decision).toBe('ok');
  });
});
