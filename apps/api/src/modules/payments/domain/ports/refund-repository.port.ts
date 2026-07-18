import type { RefundStatus } from '@prisma/client';
import type { RefundHistoryQuery } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

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
  evidence: { reference?: string; evidenceKey?: string; note?: string } | null;
}

export interface CreateRefundData {
  paymentId: string;
  bookingId: string;
  amount: bigint;
  status: RefundStatus;
  reason?: string | null;
  gatewayRefundId?: string | null;
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
  markSucceeded(
    tx: PrismaTx,
    id: string,
    evidence: { reference: string; evidenceKey?: string; note?: string },
  ): Promise<RefundRecord | null>;
  /** Take the per-booking advisory xact lock that serialises concurrent refund handlers. */
  lockForBooking(tx: PrismaTx, bookingId: string): Promise<void>;
  list(
    tx: PrismaTx,
    query: RefundHistoryQuery,
  ): Promise<{ items: RefundHistoryRecord[]; total: number }>;
  findSucceededNeedingRecovery(limit: number): Promise<RefundRecoveryRecord[]>;
  findBookingsMissingRefund(limit: number): Promise<MissingRefundRecord[]>;
}
