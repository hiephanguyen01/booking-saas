import type { RefundExecutionMode, RefundStatus } from '@prisma/client';
import type { ConfirmManualRefundInput, RefundEvidence, RefundHistoryQuery } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';

export const REFUND_REPOSITORY = Symbol('REFUND_REPOSITORY');

export interface RefundRecord {
  id: string;
  tenantId: string;
  paymentId: string;
  bookingId: string;
  amount: bigint;
  status: RefundStatus;
  gatewayRefundId: string | null;
  reason: string | null;
  affectsBookingStatus: boolean;
  evidence: RefundEvidence | null;
  executionMode: RefundExecutionMode;
  dueAt: Date | null;
  completedAt: Date | null;
}

export interface CreateRefundData {
  paymentId: string;
  bookingId: string;
  amount: bigint;
  status: RefundStatus;
  affectsBookingStatus: boolean;
  reason?: string | null;
  gatewayRefundId?: string | null;
  executionMode?: RefundExecutionMode;
  dueAt?: Date | null;
}

export interface RefundHistoryRecord extends RefundRecord {
  bookingCode: string;
  createdAt: Date;
}

export interface RefundRecoveryRecord {
  id: string;
  tenantId: string;
  paymentId: string;
  bookingId: string;
  amount: bigint;
  reason: string | null;
  affectsBookingStatus: boolean;
}

export interface MissingRefundRecord {
  tenantId: string;
  bookingId: string;
  amount: bigint;
  refundPercent: number | null;
  reason: 'booking_cancellation' | 'security_deposit';
}

export interface IRefundRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateRefundData): Promise<RefundRecord>;
  existsForBooking(tx: PrismaTx, bookingId: string, reason: string): Promise<boolean>;
  findById(tx: PrismaTx, id: string): Promise<RefundRecord | null>;
  manualReferenceExists(tx: PrismaTx, tenantId: string, reference: string): Promise<boolean>;
  completeAutomatic(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null>;
  requireManual(tx: PrismaTx, id: string, dueAt: Date): Promise<RefundRecord | null>;
  markSucceeded(
    tx: PrismaTx,
    id: string,
    evidence: ConfirmManualRefundInput,
  ): Promise<RefundRecord | null>;
  /** Take the per-booking advisory xact lock that serialises concurrent refund handlers. */
  lockForBooking(tx: PrismaTx, bookingId: string): Promise<void>;
  list(
    tx: PrismaTx,
    query: RefundHistoryQuery,
  ): Promise<RepoPage<RefundHistoryRecord>>;
  findSucceededNeedingRecovery(limit: number): Promise<RefundRecoveryRecord[]>;
  findBookingsMissingRefund(limit: number): Promise<MissingRefundRecord[]>;
}
