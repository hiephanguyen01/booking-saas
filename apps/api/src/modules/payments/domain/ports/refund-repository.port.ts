import type { RefundStatus } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const REFUND_REPOSITORY = Symbol('REFUND_REPOSITORY');

export interface RefundRecord {
  id: string;
  paymentId: string;
  bookingId: string;
  amount: bigint;
  status: RefundStatus;
  gatewayRefundId: string | null;
}

export interface CreateRefundData {
  paymentId: string;
  bookingId: string;
  amount: bigint;
  status: RefundStatus;
  reason?: string | null;
  gatewayRefundId?: string | null;
}

export interface IRefundRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateRefundData): Promise<RefundRecord>;
  existsForBooking(tx: PrismaTx, bookingId: string): Promise<boolean>;
  /** Take the per-booking advisory xact lock that serialises concurrent refund handlers. */
  lockForBooking(tx: PrismaTx, bookingId: string): Promise<void>;
}
