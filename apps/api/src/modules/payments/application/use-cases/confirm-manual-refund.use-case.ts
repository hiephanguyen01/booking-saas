import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfirmManualRefundInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
  type RefundRecord,
} from '../../domain/ports/refund-repository.port';
import { Refund } from '../../domain/entities/refund.entity';
import { RefundNotFound, RefundReferenceAlreadyUsed } from '../../domain/errors/refund-errors';

/** Tenant confirms the external bank transfer required by SePay/manual gateways. */
@Injectable()
export class ConfirmManualRefundUseCase {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    refundId: string,
    input: ConfirmManualRefundInput,
    actorUserId: string,
  ): Promise<RefundRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      let found = await this.refunds.findById(tx, refundId);
      if (!found) throw new RefundNotFound();
      await this.refunds.lockForBooking(tx, found.bookingId);
      found = (await this.refunds.findById(tx, refundId)) ?? found;
      if (Refund.rehydrate(found).classifyConfirmation() === 'already_succeeded') return found;
      if (await this.refunds.manualReferenceExists(tx, tenantId, input.reference)) {
        throw new RefundReferenceAlreadyUsed();
      }
      const updated = await this.refunds.markSucceeded(tx, refundId, input);
      if (!updated) throw new NotFoundException();
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'refund.manual_confirmed',
        entityType: 'refund',
        entityId: updated.id,
        data: {
          reference: input.reference,
          evidenceKey: input.evidenceKey ?? null,
          note: input.note ?? null,
          amount: updated.amount.toString(),
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'refund.completed',
        payload: {
          refundId: updated.id,
          paymentId: updated.paymentId,
          bookingId: updated.bookingId,
          amount: updated.amount.toString(),
          reason: updated.reason,
          affectsBookingStatus: updated.affectsBookingStatus,
        },
      });
      return updated;
    });
  }
}
