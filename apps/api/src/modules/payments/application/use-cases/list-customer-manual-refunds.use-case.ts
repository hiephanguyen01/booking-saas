import type { ManualRefundBookingResponse } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import { toCustomerManualRefundStatusFromView } from '../manual-refund.mapper';

@Injectable()
export class ListCustomerManualRefundsUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, bookingId: string): Promise<ManualRefundBookingResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const views = await this.operations.listViewsForBooking(tx, tenantId, bookingId);
      return views.map(toCustomerManualRefundStatusFromView);
    });
  }
}
