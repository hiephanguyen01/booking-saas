import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RefundBatchState } from '../entities/refund-batch.entity';

export const REFUND_BATCH_REPOSITORY = Symbol('REFUND_BATCH_REPOSITORY');

export interface RefundBatchRecord {
  id: string;
  tenantId: string;
  bookingId: string;
  requestedAmount: bigint;
  reason: string;
  affectsBookingStatus: boolean;
  status: RefundBatchState;
  completedAt: Date | null;
}

export interface RefreshRefundBatchResult {
  batch: RefundBatchRecord;
  transitionedToCompleted: boolean;
}

export interface IRefundBatchRepository {
  findByBookingReason(
    tx: PrismaTx,
    bookingId: string,
    reason: string,
  ): Promise<RefundBatchRecord | null>;
  create(
    tx: PrismaTx,
    tenantId: string,
    data: {
      bookingId: string;
      requestedAmount: bigint;
      reason: string;
      affectsBookingStatus: boolean;
    },
  ): Promise<RefundBatchRecord>;
  refreshStatus(tx: PrismaTx, batchId: string): Promise<RefreshRefundBatchResult | null>;
  findCompletedNeedingRecovery(limit: number): Promise<RefundBatchRecord[]>;
}
