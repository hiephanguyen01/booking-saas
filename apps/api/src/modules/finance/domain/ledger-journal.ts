import type { Vnd } from '../../../shared/money/money';
import type { CommissionSplit } from '../../../shared/domain/commission/commission-split';

/**
 * Pure double-entry journal builder (TONG-QUAN.md §13.2). Every builder returns a
 * balanced set of legs — the tenant-revenue leg is always the arithmetic residual,
 * so `sum(debit) === sum(credit)` by construction no matter how the split rounded
 * (the deferred `ledger_journal_balance_check` trigger enforces the same at commit).
 *
 * Two tenant-owned accounts keep cash and revenue separable in the per-party
 * ledger (both legal under the `(tenant_id, owner_type, owner_id)` unique key):
 *  - `tenant/cash`    (owner_id = null)     — gateway cash in, payouts/refunds out
 *  - `tenant/revenue` (owner_id = tenantId) — the tenant's own net take
 */
export type LedgerEntryType =
  | 'booking_revenue'
  | 'partner_share'
  | 'vat_withheld'
  | 'pit_withheld'
  | 'vat_remitted'
  | 'pit_remitted'
  | 'platform_fee'
  | 'affiliate_commission'
  | 'promo_discount'
  | 'cancellation_fee'
  | 'additional_charge'
  | 'security_deposit'
  | 'damage_deduction'
  | 'clawback'
  | 'refund'
  | 'payout';

export type OwnerType = 'platform' | 'tenant' | 'partner' | 'affiliate' | 'tax_authority';

/** Which tenant sub-account a leg targets (only meaningful for `tenant` legs). */
export type TenantAccount = 'cash' | 'revenue';

export interface LedgerOwnerRef {
  ownerType: OwnerType;
  /** partner/affiliate id; null for platform + the tenant cash account. */
  ownerId: string | null;
}

export interface JournalLeg {
  owner: LedgerOwnerRef;
  entryType: LedgerEntryType;
  /** Exactly one of debit/credit is > 0. */
  debit: Vnd;
  credit: Vnd;
}

export interface RevenueJournalInput {
  tenantId: string;
  partnerId: string;
  affiliateId: string | null;
  isHouse: boolean;
  /** The commission base (final_amount + additional_charges for a completion;
   *  paid_amount for a no-show). */
  commissionBase: Vnd;
  /** Cash that flowed through the tenant's gateway (paid_amount). */
  cashViaGateway: Vnd;
  /** Extra charges collected on-site by the partner at completion (0 for a no-show). */
  additionalCharges: Vnd;
  split: CommissionSplit;
  /** entry_type stamped on the tenant cash-in leg (`booking_revenue`). */
  cashEntryType: LedgerEntryType;
}

const owner = (ownerType: OwnerType, ownerId: string | null): LedgerOwnerRef => ({
  ownerType,
  ownerId,
});
const debit = (o: LedgerOwnerRef, entryType: LedgerEntryType, amount: Vnd): JournalLeg => ({
  owner: o,
  entryType,
  debit: amount,
  credit: 0n,
});
const credit = (o: LedgerOwnerRef, entryType: LedgerEntryType, amount: Vnd): JournalLeg => ({
  owner: o,
  entryType,
  debit: 0n,
  credit: amount,
});

/** Entry types that mark a booking as already having its terminal revenue journal. */
const REVENUE_TYPES: ReadonlySet<LedgerEntryType> = new Set([
  'booking_revenue',
  'partner_share',
  'platform_fee',
  'cancellation_fee',
]);

/**
 * Return the currently-active revenue journal from chronologically ordered
 * booking entries. A clawback closes the preceding cycle; a later partial-refund
 * release starts a new cycle and must not be confused with the old reversal.
 */
export function activeRevenueJournalId(
  entries: ReadonlyArray<{ journalId: string; entryType: LedgerEntryType }>,
): string | null {
  let activeJournalId: string | null = null;
  for (const entry of entries) {
    if (entry.entryType === 'clawback') {
      activeJournalId = null;
    } else if (REVENUE_TYPES.has(entry.entryType)) {
      activeJournalId = entry.journalId;
    }
  }
  return activeJournalId;
}

/** Idempotency guard for the booking-lifecycle revenue journal. */
export function hasRevenueJournal(
  entries: ReadonlyArray<{ journalId: string; entryType: LedgerEntryType }>,
): boolean {
  return activeRevenueJournalId(entries) !== null;
}

export function sumDebit(legs: JournalLeg[]): Vnd {
  return legs.reduce((acc, l) => acc + l.debit, 0n);
}
export function sumCredit(legs: JournalLeg[]): Vnd {
  return legs.reduce((acc, l) => acc + l.credit, 0n);
}
export function isBalanced(legs: JournalLeg[]): boolean {
  return sumDebit(legs) === sumCredit(legs);
}

/** Append the tenant-revenue residual leg so the journal balances exactly. */
function withTenantResidual(
  tenantId: string,
  legs: JournalLeg[],
  entryType: LedgerEntryType = 'booking_revenue',
): JournalLeg[] {
  const residual = sumDebit(legs) - sumCredit(legs); // >0 → tenant revenue credit
  if (residual === 0n) return legs;
  const revenue = owner('tenant', tenantId);
  return [
    ...legs,
    residual > 0n ? credit(revenue, entryType, residual) : debit(revenue, entryType, -residual),
  ];
}

/**
 * Revenue recognition journal (§13.2), shared by a completed booking (base =
 * final + additional charges) and a no-show (base = paid_amount). Cash the
 * partner collected on-site debits the partner account, reducing what the tenant
 * owes them (§13.1).
 */
export function buildRevenueJournal(input: RevenueJournalInput): JournalLeg[] {
  const { tenantId, partnerId, affiliateId, isHouse, commissionBase, additionalCharges, split } =
    input;
  const legs: JournalLeg[] = [];
  const tenantCash = owner('tenant', null);

  // For a house partner the tenant holds ALL the cash; there is no partner leg.
  const cashViaGateway = isHouse ? commissionBase : input.cashViaGateway;
  const partnerCollected = isHouse ? 0n : max0(commissionBase - cashViaGateway);

  if (cashViaGateway > 0n) legs.push(debit(tenantCash, input.cashEntryType, cashViaGateway));

  if (!isHouse && partnerCollected > 0n) {
    const partner = owner('partner', partnerId);
    const addl = additionalCharges > partnerCollected ? partnerCollected : additionalCharges;
    const onSite = partnerCollected - addl;
    if (onSite > 0n) legs.push(debit(partner, input.cashEntryType, onSite));
    if (addl > 0n) legs.push(debit(partner, 'additional_charge', addl));
  }

  // A tenant-funded discount the tenant absorbs (reduces its revenue).
  if (split.promoDiscount > 0n)
    legs.push(debit(owner('tenant', tenantId), 'promo_discount', split.promoDiscount));

  if (!isHouse && split.partnerShare > 0n)
    legs.push(credit(owner('partner', partnerId), 'partner_share', split.partnerShare));
  // Withholding is journaled at service completion. Release recognizes the
  // partner's gross share only and must not create the tax liability twice.
  if (split.platformFee > 0n)
    legs.push(credit(owner('platform', null), 'platform_fee', split.platformFee));
  if (split.affiliateCommission > 0n && affiliateId) {
    legs.push(
      credit(owner('affiliate', affiliateId), 'affiliate_commission', split.affiliateCommission),
    );
  }

  return withTenantResidual(tenantId, legs);
}

/** Service completion: reduce the partner balance and recognize tax payable. */
export function buildWithholdingJournal(params: {
  tenantId: string;
  partnerId: string;
  vatAmount: Vnd;
  pitAmount: Vnd;
}): JournalLeg[] {
  const partner = owner('partner', params.partnerId);
  // ownerId=tenantId gives each tenant exactly one non-null authority account;
  // the current ledger account uniqueness rule treats NULL values as distinct.
  const authority = owner('tax_authority', params.tenantId);
  const legs: JournalLeg[] = [];
  if (params.vatAmount > 0n) {
    legs.push(
      debit(partner, 'vat_withheld', params.vatAmount),
      credit(authority, 'vat_withheld', params.vatAmount),
    );
  }
  if (params.pitAmount > 0n) {
    legs.push(
      debit(partner, 'pit_withheld', params.pitAmount),
      credit(authority, 'pit_withheld', params.pitAmount),
    );
  }
  return legs;
}

/** Confirmed refund: return provisional tax to the partner and reduce liability. */
export function buildWithholdingReversalJournal(params: {
  tenantId: string;
  partnerId: string;
  vatAmount: Vnd;
  pitAmount: Vnd;
}): JournalLeg[] {
  const partner = owner('partner', params.partnerId);
  const authority = owner('tax_authority', params.tenantId);
  const legs: JournalLeg[] = [];
  if (params.vatAmount > 0n) {
    legs.push(
      debit(authority, 'vat_withheld', params.vatAmount),
      credit(partner, 'vat_withheld', params.vatAmount),
    );
  }
  if (params.pitAmount > 0n) {
    legs.push(
      debit(authority, 'pit_withheld', params.pitAmount),
      credit(partner, 'pit_withheld', params.pitAmount),
    );
  }
  return legs;
}

/** Payment to the tax authority: settle liability from tenant cash. */
export function buildTaxRemittanceJournal(params: {
  tenantId: string;
  vatAmount: Vnd;
  pitAmount: Vnd;
}): JournalLeg[] {
  const authority = owner('tax_authority', params.tenantId);
  const cash = owner('tenant', null);
  const legs: JournalLeg[] = [];
  if (params.vatAmount > 0n) {
    legs.push(
      debit(authority, 'vat_remitted', params.vatAmount),
      credit(cash, 'vat_remitted', params.vatAmount),
    );
  }
  if (params.pitAmount > 0n) {
    legs.push(
      debit(authority, 'pit_remitted', params.pitAmount),
      credit(cash, 'pit_remitted', params.pitAmount),
    );
  }
  return legs;
}

/**
 * Cancellation with a retained portion (§13.1): the tenant keeps `retained`
 * (paid − refunded) as a cancellation fee. No journal when the refund is full.
 */
export function buildCancellationFeeJournal(params: {
  tenantId: string;
  retained: Vnd;
}): JournalLeg[] {
  if (params.retained <= 0n) return [];
  const legs = [debit(owner('tenant', null), 'cancellation_fee', params.retained)];
  return withTenantResidual(params.tenantId, legs, 'cancellation_fee');
}

/**
 * Reverse a completed booking's journal after a post-completion dispute (§13.1).
 * Swapping debit/credit on each original leg keeps the reversal balanced and can
 * push a partner/affiliate balance negative → recovered from the next payout.
 */
export function buildClawbackJournal(originalLegs: JournalLeg[]): JournalLeg[] {
  return originalLegs.map((l) => ({
    owner: l.owner,
    entryType: 'clawback' as const,
    debit: l.credit,
    credit: l.debit,
  }));
}

/**
 * Manual payout settlement (§13.2): Debit the payee's payable / Credit tenant
 * cash — the payee's balance returns toward zero as the tenant transfers funds.
 */
export function buildPayoutJournal(params: {
  tenantId: string;
  payeeType: 'partner' | 'affiliate';
  payeeId: string;
  amount: Vnd;
}): JournalLeg[] {
  if (params.amount <= 0n) return [];
  return [
    debit(owner(params.payeeType, params.payeeId), 'payout', params.amount),
    credit(owner('tenant', null), 'payout', params.amount),
  ];
}

function max0(v: Vnd): Vnd {
  return v > 0n ? v : 0n;
}
