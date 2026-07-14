import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@booking/contracts';
import { checkBookingSoftLimit, checkHardLimit, isModuleEnabled } from './plan-limits';

describe('checkHardLimit', () => {
  it('allows below the cap and blocks at/over it', () => {
    expect(checkHardLimit(4, 5).allowed).toBe(true);
    expect(checkHardLimit(5, 5).allowed).toBe(false);
    expect(checkHardLimit(6, 5).allowed).toBe(false);
  });
});

describe('checkBookingSoftLimit', () => {
  it('never blocks but flags when over the monthly cap', () => {
    expect(checkBookingSoftLimit(10, 100)).toMatchObject({ allowed: true, overLimit: false });
    // A soft limit stays allowed even when exceeded — checkout must not break.
    expect(checkBookingSoftLimit(100, 100)).toMatchObject({ allowed: true, overLimit: true });
    expect(checkBookingSoftLimit(150, 100)).toMatchObject({ allowed: true, overLimit: true });
  });
});

describe('isModuleEnabled', () => {
  const limits: PlanLimits = {
    maxPartners: 10,
    maxListings: 100,
    maxBookingsPerMonth: 1000,
    customDomain: true,
    affiliateModule: false,
  };
  it('reads the module toggles', () => {
    expect(isModuleEnabled(limits, 'customDomain')).toBe(true);
    expect(isModuleEnabled(limits, 'affiliateModule')).toBe(false);
  });
});
