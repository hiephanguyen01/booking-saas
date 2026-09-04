import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ManualRefundConcurrentUpdate, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';

/** Escalates an unreviewed transfer exactly once; it never mutates refund money state. */
@Injectable()
export class EscalateManualRefundCheckerWaitingUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, operationId: string, waitingHours = 24): Promise<boolean> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (current.status !== 'transfer_submitted' || !current.transferSubmittedAt || current.checkerEscalatedAt) return false;
      const now = await this.tenantDb.databaseNow(tx);
      if (now.getTime() < current.transferSubmittedAt.getTime() + waitingHours * 60 * 60 * 1000) return false;
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, current.version, { checkerWaitingAt: current.checkerWaitingAt ?? current.transferSubmittedAt, checkerEscalatedAt: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      await this.outbox.emit(tx, { tenantId, eventType: 'manual_refund.checker_escalated', payload: { operationId, refundBatchId: current.refundBatchId } });
      return true;
    });
  }
}
