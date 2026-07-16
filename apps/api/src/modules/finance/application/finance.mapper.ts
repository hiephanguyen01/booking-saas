import type {
  CommissionRuleResponse,
  LedgerEntryResponse,
  OwnerBalanceResponse,
  PartnerFinanceResponse,
  PayoutResponse,
  PlatformFinanceResponse,
  TenantFinanceSummaryResponse,
  TenantPayableResponse,
} from '@booking/contracts';
import type { CommissionRuleRecord } from '../domain/ports/commission-rule-repository.port';
import type { LedgerEntryView, OwnerBalance } from '../domain/ports/ledger-repository.port';
import type { PayoutRecord } from '../domain/ports/payout-repository.port';
import type { PayableSnapshot } from './payout-payable.service';
import type { TenantFinanceSummary } from './use-cases/get-tenant-finance-summary.use-case';
import type { PartnerFinance } from './use-cases/get-partner-finance.use-case';
import type { PlatformFinance } from './use-cases/get-platform-finance.use-case';

export function toCommissionRuleResponse(r: CommissionRuleRecord): CommissionRuleResponse {
  return {
    id: r.id,
    appliesTo: r.appliesTo,
    listingTypeId: r.listingTypeId,
    categoryId: r.categoryId,
    partnerId: r.partnerId,
    tenantRateType: r.tenantRateType,
    tenantRate: r.tenantRate.toString(),
    platformRate: r.platformRate,
    affiliateRateType: r.affiliateRateType,
    affiliateRate: r.affiliateRate.toString(),
    effectiveFrom: r.effectiveFrom?.toISOString() ?? null,
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toLedgerEntryResponse(e: LedgerEntryView): LedgerEntryResponse {
  return {
    id: e.id,
    journalId: e.journalId,
    ownerType: e.ownerType,
    ownerId: e.ownerId,
    ownerName: e.ownerName,
    entryType: e.entryType,
    debit: e.debit.toString(),
    credit: e.credit.toString(),
    bookingId: e.bookingId,
    paymentId: e.paymentId,
    payoutId: e.payoutId,
    memo: e.memo,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toOwnerBalanceResponse(b: OwnerBalance): OwnerBalanceResponse {
  return {
    ownerType: b.ownerType,
    ownerId: b.ownerId,
    balance: (b.credit - b.debit).toString(),
    totalDebit: b.debit.toString(),
    totalCredit: b.credit.toString(),
  };
}

export function toTenantFinanceSummaryResponse(s: TenantFinanceSummary): TenantFinanceSummaryResponse {
  return {
    netRevenue: s.netRevenue.toString(),
    partnerPayable: s.partnerPayable.toString(),
    affiliatePayable: s.affiliatePayable.toString(),
    platformFeePayable: s.platformFeePayable.toString(),
    partnerBalances: s.partnerBalances.map(toOwnerBalanceResponse),
    affiliateBalances: s.affiliateBalances.map(toOwnerBalanceResponse),
  };
}

export function toPartnerFinanceResponse(f: PartnerFinance): PartnerFinanceResponse {
  return { balance: f.balance.toString(), entries: f.entries.map(toLedgerEntryResponse) };
}

export function toPlatformFinanceResponse(f: PlatformFinance): PlatformFinanceResponse {
  return {
    totalFeePayable: f.totalFeePayable.toString(),
    perTenant: f.perTenant.map((t) => ({ tenantId: t.tenantId, feePayable: t.feePayable.toString() })),
  };
}

/** Tenant audience: the full payout record, evidence and opening actor included. */
export function toPayoutResponse(p: PayoutRecord): PayoutResponse {
  return {
    id: p.id,
    payeeType: p.payeeType,
    payeeId: p.payeeId,
    amount: p.amount.toString(),
    periodFrom: p.periodFrom?.toISOString() ?? null,
    periodTo: p.periodTo?.toISOString() ?? null,
    status: p.status,
    paidAt: p.paidAt?.toISOString() ?? null,
    reference: p.evidence?.reference ?? null,
    evidenceKey: p.evidence?.evidenceKey ?? null,
    failureReason: p.evidence?.failureReason ?? null,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Partner audience: the payee's own runs, minus the tenant's internals.
 *
 * `reference` and `failureReason` stay — a partner needs the bank reference to
 * reconcile against their statement, and the failure reason is the only thing
 * that tells them to go fix their payout info. `evidenceKey` and `createdBy` are
 * dropped **here, server-side**: the storage key is unusable without a presigned
 * download and only leaks internal layout, and `createdBy` identifies a
 * tenant-internal staff user.
 */
export function toPartnerPayoutResponse(p: PayoutRecord): PayoutResponse {
  return { ...toPayoutResponse(p), evidenceKey: null, createdBy: null };
}

export function toTenantPayableResponse(s: PayableSnapshot): TenantPayableResponse {
  return {
    payeeType: s.payeeType,
    payeeId: s.payeeId,
    balance: s.balance.toString(),
    maturePayable: s.maturePayable.toString(),
    outstanding: s.outstanding.toString(),
    available: s.available.toString(),
    holdingDays: s.policy.holdingDays,
    minAmount: s.policy.minAmount.toString(),
    cycle: s.policy.cycle,
    eligible: s.eligible,
    ineligibleReason: s.ineligibleReason,
  };
}
