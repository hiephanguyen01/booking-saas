import type {
  BookingSettlementResponse,
  CommissionRuleResponse,
  LedgerEntryResponse,
  OwnerBalanceResponse,
  PartnerFinanceResponse,
  PayoutResponse,
  PlatformFinanceResponse,
  TenantFinanceSummaryResponse,
  TenantPayableResponse,
  SettlementDisputeResponse,
  PartnerBookingSettlementResponse,
  CustomerBookingSettlementResponse,
  CustomerDisputeState,
  PartnerSettlementDisputeResponse,
  SettlementSummaryResponse,
  TaxFilingPeriodResponse,
  TaxWithholdingCertificateResponse,
  PartnerTaxWithholdingCertificateResponse,
  SettlementTaxPositionDto,
} from '@booking/contracts';
import type { CommissionRuleRecord } from '../domain/ports/commission-rule-repository.port';
import type { LedgerEntryView, OwnerBalance } from '../domain/ports/ledger-repository.port';
import type { PayoutRecord } from '../domain/ports/payout-repository.port';
import type { SettlementRecord } from '../domain/ports/settlement-repository.port';
import type { PayableSnapshot } from './use-cases/compute-payout-payable.use-case';
import type { TenantFinanceSummary } from './use-cases/get-tenant-finance-summary.use-case';
import type { PartnerFinance } from './use-cases/get-partner-finance.use-case';
import type { PlatformFinance } from './use-cases/get-platform-finance.use-case';
import type { SettlementDisputeRecord } from '../domain/ports/settlement-dispute-repository.port';
import type { SettlementSummary } from '../domain/ports/settlement-repository.port';
import type { CustomerBookingSettlementView } from './use-cases/get-customer-booking-settlement.use-case';
import type { CustomerDisputeStateView } from './use-cases/list-customer-dispute-states.use-case';
import type {
  TaxCertificateRecord,
  TaxFilingPeriodRecord,
  SettlementTaxPosition,
} from '../domain/ports/tax-compliance-repository.port';

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

export function toTenantFinanceSummaryResponse(
  s: TenantFinanceSummary,
): TenantFinanceSummaryResponse {
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

/**
 * `taxPosition` is omitted by the paginated list endpoints — a per-row tax trail
 * would be one extra query per row and noise in a table. Detail reads pass it.
 */
export function toBookingSettlementResponse(
  settlement: SettlementRecord,
  taxPosition: SettlementTaxPosition | null = null,
): BookingSettlementResponse {
  return {
    id: settlement.id,
    tenantId: settlement.tenantId,
    tenantName: settlement.tenantName,
    bookingId: settlement.bookingId,
    paymentId: settlement.paymentId,
    partnerId: settlement.partnerId,
    status: settlement.status,
    kind: settlement.kind,
    bookingCode: settlement.bookingCode,
    listingTitle: settlement.listingTitle,
    customerName: settlement.customerName,
    partnerName: settlement.partnerName,
    onlineHeldAmount: settlement.onlineHeldAmount.toString(),
    remainingHeldAmount: (settlement.onlineHeldAmount > settlement.refundedAmount
      ? settlement.onlineHeldAmount - settlement.refundedAmount
      : 0n
    ).toString(),
    onsiteCollectedAmount: settlement.onsiteCollectedAmount.toString(),
    securityDepositHeld: settlement.securityDepositHeld.toString(),
    tenantCommissionGross: settlement.tenantCommissionGross.toString(),
    tenantNetEarning: settlement.tenantNetEarning.toString(),
    partnerGrossEarning: settlement.partnerGrossEarning.toString(),
    partnerPayable: settlement.partnerPayable.toString(),
    partnerVatWithheld: settlement.partnerVatWithheld.toString(),
    partnerPitWithheld: settlement.partnerPitWithheld.toString(),
    platformFee: settlement.platformFee.toString(),
    affiliateCommission: settlement.affiliateCommission.toString(),
    refundedAmount: settlement.refundedAmount.toString(),
    retainedAmount: settlement.retainedAmount.toString(),
    refundId: settlement.refundId,
    payoutPendingAmount: settlement.payoutPendingAmount.toString(),
    paidAmount: settlement.paidAmount.toString(),
    remainingPayableAmount: settlement.remainingPayableAmount.toString(),
    latestPayoutId: settlement.latestPayoutId,
    latestPayoutStatus: settlement.latestPayoutStatus,
    latestPayoutReference: settlement.latestPayoutReference,
    latestPayoutPaidAt: settlement.latestPayoutPaidAt?.toISOString() ?? null,
    completedAt: settlement.completedAt?.toISOString() ?? null,
    disputeUntil: settlement.disputeUntil?.toISOString() ?? null,
    releasedAt: settlement.releasedAt?.toISOString() ?? null,
    taxPosition: toSettlementTaxPosition(taxPosition),
    createdAt: settlement.createdAt.toISOString(),
    updatedAt: settlement.updatedAt.toISOString(),
  };
}

function toSettlementTaxPosition(
  position: SettlementTaxPosition | null,
): SettlementTaxPositionDto | null {
  if (!position || !position.assessedAt) return null;
  return {
    assessedTaxableRevenue: position.assessedTaxableRevenue.toString(),
    assessedVat: position.assessedVat.toString(),
    assessedPit: position.assessedPit.toString(),
    assessedAt: position.assessedAt.toISOString(),
    reversedTaxableRevenue: position.reversedTaxableRevenue.toString(),
    reversedVat: position.reversedVat.toString(),
    reversedPit: position.reversedPit.toString(),
    reversalCount: position.reversalCount,
    netVat: position.netVat.toString(),
    netPit: position.netPit.toString(),
  };
}

export function toTaxFilingPeriodResponse(period: TaxFilingPeriodRecord): TaxFilingPeriodResponse {
  return {
    id: period.id,
    taxYear: period.taxYear,
    taxMonth: period.taxMonth,
    status: period.status,
    taxableRevenue: period.taxableRevenue.toString(),
    vatAmount: period.vatAmount.toString(),
    pitAmount: period.pitAmount.toString(),
    eventCount: period.eventCount,
    submissionReference: period.submissionReference,
    submittedAt: period.submittedAt?.toISOString() ?? null,
    paidAt: period.paidAt?.toISOString() ?? null,
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
  };
}

export function toTaxWithholdingCertificateResponse(
  certificate: TaxCertificateRecord,
): TaxWithholdingCertificateResponse {
  return {
    id: certificate.id,
    partnerId: certificate.partnerId,
    partnerName: certificate.partnerName,
    taxYear: certificate.taxYear,
    status: certificate.status,
    version: certificate.version,
    certificateNumber: certificate.certificateNumber,
    vatAmount: certificate.vatAmount.toString(),
    pitAmount: certificate.pitAmount.toString(),
    issuedAt: certificate.issuedAt?.toISOString() ?? null,
    voidedAt: certificate.voidedAt?.toISOString() ?? null,
    voidReason: certificate.voidReason,
    createdAt: certificate.createdAt.toISOString(),
    updatedAt: certificate.updatedAt.toISOString(),
  };
}

export function toPartnerTaxWithholdingCertificateResponse(
  certificate: TaxCertificateRecord,
): PartnerTaxWithholdingCertificateResponse {
  const response = toTaxWithholdingCertificateResponse(certificate);
  return {
    id: response.id,
    taxYear: response.taxYear,
    status: response.status,
    version: response.version,
    certificateNumber: response.certificateNumber,
    vatAmount: response.vatAmount,
    pitAmount: response.pitAmount,
    issuedAt: response.issuedAt,
    voidedAt: response.voidedAt,
    voidReason: response.voidReason,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

export function toPartnerBookingSettlementResponse(
  settlement: SettlementRecord,
  taxPosition: SettlementTaxPosition | null = null,
): PartnerBookingSettlementResponse {
  const full = toBookingSettlementResponse(settlement, taxPosition);
  return {
    id: full.id,
    bookingId: full.bookingId,
    status: full.status,
    kind: full.kind,
    bookingCode: full.bookingCode,
    listingTitle: full.listingTitle,
    partnerName: full.partnerName,
    onlineHeldAmount: full.onlineHeldAmount,
    remainingHeldAmount: full.remainingHeldAmount,
    onsiteCollectedAmount: full.onsiteCollectedAmount,
    partnerGrossEarning: full.partnerGrossEarning,
    partnerPayable: full.partnerPayable,
    refundedAmount: full.refundedAmount,
    payoutPendingAmount: full.payoutPendingAmount,
    paidAmount: full.paidAmount,
    remainingPayableAmount: full.remainingPayableAmount,
    latestPayoutId: full.latestPayoutId,
    latestPayoutStatus: full.latestPayoutStatus,
    latestPayoutReference: full.latestPayoutReference,
    latestPayoutPaidAt: full.latestPayoutPaidAt,
    completedAt: full.completedAt,
    disputeUntil: full.disputeUntil,
    releasedAt: full.releasedAt,
    taxPosition: full.taxPosition,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  };
}

export function toCustomerDisputeStateResponse(
  view: CustomerDisputeStateView,
): CustomerDisputeState {
  return {
    bookingId: view.bookingId,
    canOpenDispute: view.canOpenDispute,
    disputeUntil: view.disputeUntil?.toISOString() ?? null,
  };
}

export function toCustomerBookingSettlementResponse(
  view: CustomerBookingSettlementView,
): CustomerBookingSettlementResponse {
  const { settlement, dispute, canOpenDispute } = view;
  const full = toBookingSettlementResponse(settlement);
  return {
    id: full.id,
    bookingId: full.bookingId,
    status: full.status,
    kind: full.kind,
    bookingCode: full.bookingCode,
    onlineHeldAmount: full.onlineHeldAmount,
    remainingHeldAmount: full.remainingHeldAmount,
    refundedAmount: full.refundedAmount,
    retainedAmount: full.retainedAmount,
    completedAt: full.completedAt,
    disputeUntil: full.disputeUntil,
    releasedAt: full.releasedAt,
    updatedAt: full.updatedAt,
    canOpenDispute,
    refundConfirmed: settlement.refundId !== null && settlement.status !== 'refund_pending',
    dispute: dispute
      ? {
          id: dispute.id,
          status: dispute.status,
          resolution: dispute.resolution,
          resolutionNote: dispute.resolutionNote,
          refundAmount: dispute.refundAmount.toString(),
          partnerResponse: dispute.partnerResponse,
          partnerRespondedAt: dispute.partnerRespondedAt?.toISOString() ?? null,
          resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
          createdAt: dispute.createdAt.toISOString(),
        }
      : null,
  };
}

export function toSettlementDisputeResponse(
  dispute: SettlementDisputeRecord,
): SettlementDisputeResponse {
  return {
    id: dispute.id,
    settlementId: dispute.settlementId,
    bookingId: dispute.bookingId,
    openedByUserId: dispute.openedByUserId,
    openedByRole: dispute.openedByRole,
    bookingCode: dispute.bookingCode,
    listingTitle: dispute.listingTitle,
    customerName: dispute.customerName,
    partnerName: dispute.partnerName,
    onlineHeldAmount: dispute.onlineHeldAmount.toString(),
    remainingHeldAmount: dispute.remainingHeldAmount.toString(),
    disputeUntil: dispute.disputeUntil?.toISOString() ?? null,
    reason: dispute.reason,
    evidence: dispute.evidence,
    partnerResponse: dispute.partnerResponse,
    partnerRespondedAt: dispute.partnerRespondedAt?.toISOString() ?? null,
    status: dispute.status,
    resolution: dispute.resolution,
    resolutionNote: dispute.resolutionNote,
    refundAmount: dispute.refundAmount.toString(),
    resolvedBy: dispute.resolvedBy,
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
  };
}

export function toAdminSettlementDisputeResponse(dispute: SettlementDisputeRecord) {
  return {
    ...toSettlementDisputeResponse(dispute),
    tenantId: dispute.tenantId,
    tenantName: dispute.tenantName ?? dispute.tenantId,
  };
}

export function toPartnerSettlementDisputeResponse(
  dispute: SettlementDisputeRecord,
): PartnerSettlementDisputeResponse {
  const full = toSettlementDisputeResponse(dispute);
  return {
    id: full.id,
    settlementId: full.settlementId,
    bookingId: full.bookingId,
    openedByRole: full.openedByRole,
    bookingCode: full.bookingCode,
    listingTitle: full.listingTitle,
    customerName: full.customerName,
    partnerName: full.partnerName,
    onlineHeldAmount: full.onlineHeldAmount,
    remainingHeldAmount: full.remainingHeldAmount,
    disputeUntil: full.disputeUntil,
    reason: full.reason,
    evidence: full.evidence,
    partnerResponse: full.partnerResponse,
    partnerRespondedAt: full.partnerRespondedAt,
    status: full.status,
    resolution: full.resolution,
    resolutionNote: full.resolutionNote,
    refundAmount: full.refundAmount,
    resolvedAt: full.resolvedAt,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  };
}

export function toSettlementSummaryResponse(summary: SettlementSummary): SettlementSummaryResponse {
  return {
    heldAmount: summary.heldAmount.toString(),
    disputedAmount: summary.disputedAmount.toString(),
    heldPartnerPayableAmount: summary.heldPartnerPayableAmount.toString(),
    disputedPartnerPayableAmount: summary.disputedPartnerPayableAmount.toString(),
    refundPendingAmount: summary.refundPendingAmount.toString(),
    releasedPayableAmount: summary.releasedPayableAmount.toString(),
    payoutPendingAmount: summary.payoutPendingAmount.toString(),
    paidAmount: summary.paidAmount.toString(),
    remainingPayableAmount: summary.remainingPayableAmount.toString(),
    counts: summary.counts,
  };
}

export function toPlatformFinanceResponse(f: PlatformFinance): PlatformFinanceResponse {
  return {
    totalFeePayable: f.totalFeePayable.toString(),
    perTenant: f.perTenant.map((t) => ({
      tenantId: t.tenantId,
      feePayable: t.feePayable.toString(),
    })),
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
