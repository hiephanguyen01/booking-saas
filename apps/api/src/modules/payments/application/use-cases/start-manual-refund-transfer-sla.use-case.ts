import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ManualRefundConcurrentUpdate } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';

/** Sets the transfer deadline once, with the clock anchored at destination readiness. */
@Injectable()
export class StartManualRefundTransferSlaUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, operationId: string, slaHours: number): Promise<boolean> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current || current.status !== 'ready_for_transfer' || current.transferDueAt) return false;
      if (!current.readyAt || !Number.isInteger(slaHours) || slaHours < 1 || slaHours > 720) return false;
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, current.version, { transferDueAt: new Date(current.readyAt.getTime() + slaHours * 60 * 60 * 1000) });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      return true;
    });
  }
}
