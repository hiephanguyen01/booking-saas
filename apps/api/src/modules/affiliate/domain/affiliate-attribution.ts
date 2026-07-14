/**
 * Pure attribution fraud checks (TONG-QUAN.md §15.2). Given the facts resolved by
 * the service (who the affiliate is, who the customer is, whether the affiliate
 * works for the listing's partner), decide whether the booking may be attributed.
 * No framework/Prisma imports — unit-tested in isolation.
 *
 *  - **Self-referral**: the affiliate is the customer (same user, or matching
 *    email/phone on a guest checkout) — no commission for referring yourself.
 *  - **Self-dealing**: the affiliate is a `partner_members` member of the partner
 *    who owns the listing — otherwise a partner could become their own affiliate
 *    to turn commission into a hidden discount taken from the tenant's share.
 */
export interface AttributionFacts {
  affiliateUserId: string;
  affiliateEmail: string | null;
  affiliatePhone: string | null;
  /** The booking's customer (a real account or a just-created guest user). */
  customerUserId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** True when the affiliate user is a member of the listing's owning partner. */
  affiliateIsPartnerMember: boolean;
}

export type AttributionRejection = 'SELF_REFERRAL' | 'SELF_DEALING';

export type AttributionDecision = { ok: true } | { ok: false; rejection: AttributionRejection };

function normEmail(v: string | null): string | null {
  return v ? v.trim().toLowerCase() || null : null;
}

/** Compare phones on their digits only, so `+84 90…` and `090…` still collide. */
function normPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function evaluateAttribution(facts: AttributionFacts): AttributionDecision {
  if (facts.affiliateUserId === facts.customerUserId) return { ok: false, rejection: 'SELF_REFERRAL' };

  const aEmail = normEmail(facts.affiliateEmail);
  const cEmail = normEmail(facts.customerEmail);
  if (aEmail && cEmail && aEmail === cEmail) return { ok: false, rejection: 'SELF_REFERRAL' };

  const aPhone = normPhone(facts.affiliatePhone);
  const cPhone = normPhone(facts.customerPhone);
  if (aPhone && cPhone && aPhone === cPhone) return { ok: false, rejection: 'SELF_REFERRAL' };

  if (facts.affiliateIsPartnerMember) return { ok: false, rejection: 'SELF_DEALING' };

  return { ok: true };
}
