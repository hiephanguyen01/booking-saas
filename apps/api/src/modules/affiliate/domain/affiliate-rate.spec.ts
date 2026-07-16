import { describe, expect, it } from 'vitest';
import { resolveEffectiveAffiliateRate } from './affiliate-rate';

describe('resolveEffectiveAffiliateRate', () => {
  const percentRule = { affiliateRateType: 'percent', affiliateRate: 10n } as const;
  const fixedRule = { affiliateRateType: 'fixed', affiliateRate: 50_000n } as const;

  it('prefers the custom rate over the rule (§15.2 priority)', () => {
    expect(resolveEffectiveAffiliateRate(12n, percentRule)).toEqual({
      rate: 12n,
      rateType: 'percent',
      source: 'custom',
    });
  });

  it('reports an override as a percent even when the rule is fixed', () => {
    // custom_rate can only ever be a whole percent — applyCustomRate() bakes it
    // into the snapshot as `percent`, so the reported rate must agree.
    expect(resolveEffectiveAffiliateRate(12n, fixedRule)).toEqual({
      rate: 12n,
      rateType: 'percent',
      source: 'custom',
    });
  });

  it('falls back to the rule when there is no override — the common case', () => {
    expect(resolveEffectiveAffiliateRate(null, percentRule)).toEqual({
      rate: 10n,
      rateType: 'percent',
      source: 'rule',
    });
  });

  it("carries the rule's fixed rate through verbatim", () => {
    expect(resolveEffectiveAffiliateRate(null, fixedRule)).toEqual({
      rate: 50_000n,
      rateType: 'fixed',
      source: 'rule',
    });
  });

  it('reports zero/none when neither an override nor a rule exists', () => {
    expect(resolveEffectiveAffiliateRate(null, null)).toEqual({
      rate: 0n,
      rateType: 'percent',
      source: 'none',
    });
  });

  it('treats a 0% override as a real override, not as "unset"', () => {
    // 0n is falsy-adjacent: a `customRate || rule` implementation would silently
    // pay the rule's rate to an affiliate the tenant explicitly zeroed out.
    expect(resolveEffectiveAffiliateRate(0n, percentRule)).toEqual({
      rate: 0n,
      rateType: 'percent',
      source: 'custom',
    });
  });
});
