import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ManualRefundConcurrentUpdate, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';

const HOUR_MS = 60 * 60 * 1000;

/** Atomically claims a customer-detail reminder before publishing its provider-neutral event. */
@Injectable()
export class SendManualRefundCustomerDetailReminderUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, operationId: string, hours: 24 | 48): Promise<boolean> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (current.status !== 'awaiting_details') return false;
      const anchor = current.reopenedAt ?? current.createdAt;
      const now = await this.tenantDb.databaseNow(tx);
      if (now.getTime() < anchor.getTime() + hours * HOUR_MS) return false;
      const marker = hours === 24 ? current.customerDetailReminder24At : current.customerDetailReminder48At;
      if (marker) return false;
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, current.version, hours === 24
        ? { customerDetailReminder24At: now }
        : { customerDetailReminder48At: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      await this.outbox.emit(tx, { tenantId, eventType: 'manual_refund.customer_details_reminder', payload: { operationId, refundBatchId: current.refundBatchId, hours } });
      return true;
    });
  }
}
