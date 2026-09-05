import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import { loadCustomerManualRefund } from '../manual-refund-customer-access';
import { toCustomerManualRefundStatusResponse } from '../manual-refund.mapper';

@Injectable()
export class GetCustomerManualRefundStatusUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly batches: IRefundBatchRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, bookingId: string, bookingCode: string, operationId: string) {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const { operation, batch } = await loadCustomerManualRefund(
        tx,
        this.operations,
        this.batches,
        tenantId,
        bookingId,
        operationId,
      );
      return toCustomerManualRefundStatusResponse(operation, batch, bookingCode);
    });
  }
}
