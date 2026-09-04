import type { AcknowledgeManualRefundInput, ManualRefundStatusResponse } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ManualRefundConcurrentUpdate } from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import { loadCustomerManualRefund } from '../manual-refund-customer-access';
import {
  toCustomerManualRefundStatusResponse,
  toManualRefundOperation,
} from '../manual-refund.mapper';

@Injectable()
export class AcknowledgeCustomerManualRefundReceivedUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly batches: IRefundBatchRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    bookingId: string,
    bookingCode: string,
    operationId: string,
    input: AcknowledgeManualRefundInput & { acknowledgement: 'received' },
  ): Promise<ManualRefundStatusResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const { operation: current, batch } = await loadCustomerManualRefund(
        tx,
        this.operations,
        this.batches,
        tenantId,
        bookingId,
        operationId,
      );
      if (current.version !== input.expectedVersion) throw new ManualRefundConcurrentUpdate();
      const entity = toManualRefundOperation(current);
      const acknowledgedAt = await this.tenantDb.databaseNow(tx);
      entity.acknowledgeCustomer('received', acknowledgedAt, input.note?.trim() || null);
      const updated = await this.operations.casUpdate(
        tx,
        tenantId,
        operationId,
        current.status,
        current.version,
        {
          customerAcknowledgement: 'received',
          customerAcknowledgedAt: acknowledgedAt,
          customerAcknowledgementNote: input.note?.trim() || null,
        },
      );
      if (!updated) throw new ManualRefundConcurrentUpdate();
      return toCustomerManualRefundStatusResponse(updated, batch, bookingCode);
    });
  }
}
