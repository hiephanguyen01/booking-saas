import { percentOfBps, type Vnd } from '../../money/money';
import { vatOf, type TaxMethod } from '../tax/tax';

/**
 * Pure commission maths (TONG-QUAN.md §3.3 / §12.4 / §13.1). No framework or
 * Prisma imports — this is the immutable calculation captured at booking time
 * and replayed from the `commission_snapshot` when a booking completes, so a
 * later rule change never touches a past booking.
 *
 * Rules that hold across every case:
 *  - The **platform fee** and **affiliate commission** are ALWAYS computed on the
 *    amount the customer actually pays (`final_amount`), NET of VAT (§VAT).
 *  - Prices are VAT-INCLUSIVE gross. Every rate bites on the net; the partner
 *    keeps the gross residual, because under the agent model the VAT inside its
 *    share is its own to remit. Cash therefore still reconciles exactly.
 *  - The **partner share** depends on who funds a discount: `funded_by = tenant`
 *    pays the partner on the ORIGINAL price (`total_amount`); `funded_by = partner`
 *    (or no discount) pays on the discounted price (`final_amount`).
 *  - Every split leg is **≥ 0** (a `fixed` rule on a tiny booking is floored + flagged).
 *  - A **house partner** has no partner-payable leg; the platform fee is taken on
 *    GMV and the tenant keeps the remainder.
 */
export type RateType = 'percent' | 'fixed';
export type FundedBy = 'tenant' | 'partner' | null;

/** Framework-free view of the resolved commission rule stored on the booking. */
export interface CommissionRates {
  tenantRateType: RateType;
  /** `percent`: whole percent (15 = 15%). `fixed`: VND đồng. */
  tenantRate: Vnd;
  /** Platform fee, whole percent (2 = 2%). */
  platformRate: number;
  affiliateRateType: RateType;
  affiliateRate: Vnd;
  /** Tenant-owned inventory: no partner payable, platform fee on GMV (§7.3). */
  isHouse: boolean;
  /**
   * VAT contained in the gross amounts, in basis points (800 = 8%); 0 = no VAT.
   * Every rate below bites on the amount NET of this (§VAT option B), so a
   * published 15% take-rate is 15% of the seller's revenue rather than 15% of
   * revenue + state VAT.
   */
  vatBps: number;
  /**
   * Which VAT regime produced `vatBps`. The two use different arithmetic — a
   * deduction-method rate is contained in the gross, a percentage-method rate is
   * applied straight to revenue — so the base every commission bites on depends
   * on it, not just on the rate.
   */
  vatMethod: TaxMethod;
}

export interface SplitInput {
  /** Pre-discount price (§7.5). */
  totalAmount: Vnd;
  /** What the customer pays at checkout = total − discount. */
  finalAmount: Vnd;
  fundedBy: FundedBy;
  /** Only add an affiliate leg when the booking actually carries an affiliate. */
  hasAffiliate: boolean;
  rates: CommissionRates;
}

export type SplitFlag = 'PARTNER_SHARE_FLOORED' | 'TENANT_NET_NEGATIVE';

export interface CommissionSplit {
  partnerShare: Vnd;
  platformFee: Vnd;
  affiliateCommission: Vnd;
  /** Tenant's net take (may be negative when a fixed/promo combo bites — flagged). */
  tenantNet: Vnd;
  /** Tenant-funded discount the tenant absorbs (0 otherwise). */
  promoDiscount: Vnd;
  fundedBy: FundedBy;
  flags: SplitFlag[];
}

/** Whole-percent helper: 15 (%) → 1500 bps, half-up rounding. */
function pct(amount: Vnd, wholePercent: number): Vnd {
  return percentOfBps(amount, Math.round(wholePercent * 100));
}

/** Apply a `percent | fixed` rate to a base, clamped to `[0, base]`. */
function applyRate(type: RateType, value: Vnd, base: Vnd): Vnd {
  const raw = type === 'percent' ? pct(base, Number(value)) : value;
  if (raw < 0n) return 0n;
  if (raw > base) return base;
  return raw;
}

/**
 * Compute the four-way split for a booking. The `tenantNet` returned here is the
 * informational net take (used for validation + reporting); the authoritative
 * ledger journal derives the tenant leg as the balancing residual so it can never
 * drift from the fixed partner/platform/affiliate legs.
 */
export function computeCommissionSplit(input: SplitInput): CommissionSplit {
  const { totalAmount, finalAmount, fundedBy, hasAffiliate, rates } = input;
  const flags: SplitFlag[] = [];

  const discount = totalAmount > finalAmount ? totalAmount - finalAmount : 0n;
  const promoDiscount = fundedBy === 'tenant' ? discount : 0n;

  // §VAT option B — rates apply to the VAT-EXCLUSIVE base. The partner keeps the
  // GROSS residual because, under the agent model, the VAT inside its share is
  // its own to remit. Cash therefore still reconciles and the ledger journal in
  // `ledger-journal.entity.ts` is untouched.
  const netFinal = finalAmount - vatOf(finalAmount, rates.vatBps, rates.vatMethod);
  const netTotal = totalAmount - vatOf(totalAmount, rates.vatBps, rates.vatMethod);

  // Platform + affiliate ALWAYS bite on final_amount — net of VAT (§VAT).
  const platformFee = pct(netFinal, rates.platformRate);
  const affiliateCommission = hasAffiliate
    ? applyRate(rates.affiliateRateType, rates.affiliateRate, netFinal)
    : 0n;

  if (rates.isHouse) {
    // No partner leg; the tenant sells its own inventory and keeps the remainder.
    // The take stays GROSS: the tenant is the seller here, so the VAT inside it is
    // the tenant's own liability and must not leak out of the journal.
    const tenantNet = finalAmount - platformFee - affiliateCommission;
    if (tenantNet < 0n) flags.push('TENANT_NET_NEGATIVE');
    return { partnerShare: 0n, platformFee, affiliateCommission, tenantNet, promoDiscount, fundedBy, flags };
  }

  // Gross basis pays the partner; net basis sizes the tenant's commission (§VAT).
  const partnerBasis = fundedBy === 'tenant' ? totalAmount : finalAmount;
  const netPartnerBasis = fundedBy === 'tenant' ? netTotal : netFinal;
  // Compute the raw (uncapped) tenant commission so the partner-share floor below
  // detects — and flags — a fixed fee that exceeds the booking value (§13.1).
  let tenantCommission =
    rates.tenantRateType === 'percent'
      ? pct(netPartnerBasis, Number(rates.tenantRate))
      : rates.tenantRate;
  if (tenantCommission < 0n) tenantCommission = 0n;
  let partnerShare = partnerBasis - tenantCommission;
  if (partnerShare < 0n) {
    // A fixed fee larger than the booking value — floor the partner at 0 and cap
    // the tenant commission at what actually exists (§13.1).
    partnerShare = 0n;
    tenantCommission = partnerBasis;
    flags.push('PARTNER_SHARE_FLOORED');
  }

  const tenantNet = tenantCommission - platformFee - affiliateCommission - promoDiscount;
  if (tenantNet < 0n) flags.push('TENANT_NET_NEGATIVE');

  return { partnerShare, platformFee, affiliateCommission, tenantNet, promoDiscount, fundedBy, flags };
}
