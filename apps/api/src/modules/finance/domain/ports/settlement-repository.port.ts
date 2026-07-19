import type { SettlementKind, SettlementStatus } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const SETTLEMENT_REPOSITORY = Symbol('SETTLEMENT_REPOSITORY');

export interface SettlementRecord {
  id: string;
  tenantId: string;
  tenantName: string | null;
  bookingId: string;
  paymentId: string;
  partnerId: string;
  status: SettlementStatus;
  kind: SettlementKind;
  bookingCode: string | null;
  listingTitle: string | null;
  customerName: string | null;
  partnerName: string | null;
  onlineHeldAmount: bigint;
  onsiteCollectedAmount: bigint;
  securityDepositHeld: bigint;
  tenantCommissionGross: bigint;
  tenantNetEarning: bigint;
  partnerGrossEarning: bigint;
  partnerPayable: bigint;
  platformFee: bigint;
  affiliateCommission: bigint;
  refundedAmount: bigint;
  retainedAmount: bigint;
  refundId: string | null;
  payoutPendingAmount: bigint;
  paidAmount: bigint;
  remainingPayableAmount: bigint;
  latestPayoutId: string | null;
  latestPayoutStatus: 'pending' | 'processing' | 'paid' | 'failed' | null;
  latestPayoutReference: string | null;
  latestPayoutPaidAt: Date | null;
  completedAt: Date | null;
  disputeUntil: Date | null;
  releasedAt: Date | null;
  releaseJournalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReleaseAmounts {
  tenantCommissionGross: bigint;
  tenantNetEarning: bigint;
  partnerGrossEarning: bigint;
  partnerPayable: bigint;
  platformFee: bigint;
  affiliateCommission: bigint;
}

export interface SettlementListFilters {
  status?: SettlementStatus;
  partnerId?: string;
}

export interface SettlementSummary {
  heldAmount: bigint;
  disputedAmount: bigint;
  heldPartnerPayableAmount: bigint;
  disputedPartnerPayableAmount: bigint;
  refundPendingAmount: bigint;
  releasedPayableAmount: bigint;
  payoutPendingAmount: bigint;
  paidAmount: bigint;
  remainingPayableAmount: bigint;
  counts: Record<SettlementStatus, number>;
}

export interface ISettlementRepository {
  createHeldFromPayment(
    tx: PrismaTx,
    tenantId: string,
    paymentId: string,
  ): Promise<SettlementRecord | null>;
  /** Recover event-order races by materializing HELD from the booking's succeeded checkout. */
  ensureHeldForBooking(
    tx: PrismaTx,
    tenantId: string,
    bookingId: string,
  ): Promise<SettlementRecord | null>;
  findById(tx: PrismaTx, id: string): Promise<SettlementRecord | null>;
  findByBooking(tx: PrismaTx, bookingId: string): Promise<SettlementRecord | null>;
  startDisputeWindow(
    tx: PrismaTx,
    bookingId: string,
    onsiteCollectedAmount: bigint,
    holdingDays: number,
    amounts: ReleaseAmounts,
    kind?: SettlementKind,
  ): Promise<SettlementRecord | null>;
  prepareRefund(
    tx: PrismaTx,
    bookingId: string,
    refundAmount: bigint,
    kind?: SettlementKind,
  ): Promise<SettlementRecord | null>;
  finalizeRefund(
    tx: PrismaTx,
    bookingId: string,
    refundId: string,
    refundedAmount: bigint,
    holdingDays: number,
  ): Promise<SettlementRecord | null>;
  markDisputed(tx: PrismaTx, settlementId: string): Promise<boolean>;
  resolveDisputeForRelease(tx: PrismaTx, settlementId: string): Promise<boolean>;
  markReleased(
    tx: PrismaTx,
    id: string,
    journalId: string,
    amounts: ReleaseAmounts,
  ): Promise<SettlementRecord | null>;
  list(
    tx: PrismaTx,
    page: number,
    pageSize: number,
    filters: SettlementListFilters,
  ): Promise<{ items: SettlementRecord[]; total: number }>;
  listPlatform(
    page: number,
    pageSize: number,
    filters: SettlementListFilters,
  ): Promise<{ items: SettlementRecord[]; total: number }>;
  summarize(tx: PrismaTx, partnerId?: string): Promise<SettlementSummary>;
  findDue(limit: number): Promise<Array<{ id: string; tenantId: string }>>;
}
