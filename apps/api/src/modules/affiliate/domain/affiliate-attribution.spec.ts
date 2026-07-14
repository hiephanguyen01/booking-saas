import { describe, expect, it } from 'vitest';
import { evaluateAttribution, type AttributionFacts } from './affiliate-attribution';

const base: AttributionFacts = {
  affiliateUserId: 'aff-user',
  affiliateEmail: 'aff@example.com',
  affiliatePhone: '0900000001',
  customerUserId: 'cust-user',
  customerEmail: 'cust@example.com',
  customerPhone: '0900000002',
  affiliateIsPartnerMember: false,
};

describe('evaluateAttribution (§15.2)', () => {
  it('accepts a genuine third-party referral', () => {
    expect(evaluateAttribution(base)).toEqual({ ok: true });
  });

  it('rejects self-referral when the affiliate is the customer (same user id)', () => {
    expect(evaluateAttribution({ ...base, customerUserId: 'aff-user' })).toEqual({
      ok: false,
      rejection: 'SELF_REFERRAL',
    });
  });

  it('rejects self-referral on a matching email (case-insensitive)', () => {
    const facts = { ...base, customerEmail: 'AFF@example.com' };
    expect(evaluateAttribution(facts)).toEqual({ ok: false, rejection: 'SELF_REFERRAL' });
  });

  it('rejects self-referral on a matching phone (compares digits, ignores spacing/dashes)', () => {
    const facts = { ...base, customerPhone: '090-000 0001' };
    expect(evaluateAttribution(facts)).toEqual({ ok: false, rejection: 'SELF_REFERRAL' });
  });

  it('rejects self-dealing when the affiliate works for the listing partner', () => {
    expect(evaluateAttribution({ ...base, affiliateIsPartnerMember: true })).toEqual({
      ok: false,
      rejection: 'SELF_DEALING',
    });
  });

  it('does not treat two empty emails/phones as a match', () => {
    const facts: AttributionFacts = {
      ...base,
      affiliateEmail: null,
      customerEmail: null,
      affiliatePhone: null,
      customerPhone: null,
    };
    expect(evaluateAttribution(facts)).toEqual({ ok: true });
  });
});
