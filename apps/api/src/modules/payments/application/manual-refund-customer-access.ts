import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { ManualRefundOperationNotFound } from '../domain/errors/manual-refund-errors';
import type {
  IManualRefundOperationRepository,
  ManualRefundOperationRecord,
} from '../domain/ports/manual-refund-operation-repository.port';
import type {
  IRefundBatchRepository,
  RefundBatchRecord,
} from '../domain/ports/refund-batch-repository.port';

export async function loadCustomerManualRefund(
  tx: PrismaTx,
  operations: IManualRefundOperationRepository,
  batches: IRefundBatchRepository,
  tenantId: string,
  bookingId: string,
  operationId: string,
): Promise<{ operation: ManualRefundOperationRecord; batch: RefundBatchRecord }> {
  const operation = await operations.findById(tx, tenantId, operationId);
  if (!operation || operation.tenantId !== tenantId) throw new ManualRefundOperationNotFound();
  const batch = await batches.findById(tx, tenantId, operation.refundBatchId);
  if (
    !batch ||
    batch.tenantId !== tenantId ||
    batch.bookingId !== bookingId ||
    batch.id !== operation.refundBatchId
  ) {
    throw new ManualRefundOperationNotFound();
  }
  return { operation, batch };
}
