import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfirmManualRefundInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
  type RefundRecord,
} from '../../domain/ports/refund-repository.port';

/** Tenant confirms the external bank transfer required by SePay/manual gateways. */
@Injectable()
export class ConfirmManualRefundUseCase {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    refundId: string,
    input: ConfirmManualRefundInput,
  ): Promise<RefundRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      let found = await this.refunds.findById(tx, refundId);
      if (!found) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'REFUND_NOT_FOUND',
          message: 'Refund not found',
        });
      }
      await this.refunds.lockForBooking(tx, found.bookingId);
      found = (await this.refunds.findById(tx, refundId)) ?? found;
      if (found.status === 'succeeded') return found;
      if (!['manual_required', 'pending'].includes(found.status)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'REFUND_NOT_CONFIRMABLE',
          message: `Refund is ${found.status}`,
        });
      }
      const updated = await this.refunds.markSucceeded(tx, refundId, input);
      if (!updated) throw new NotFoundException();
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'refund.completed',
        payload: {
          refundId: updated.id,
          paymentId: updated.paymentId,
          bookingId: updated.bookingId,
          amount: updated.amount.toString(),
          reason: updated.reason,
          affectsBookingStatus: updated.reason !== 'security_deposit',
        },
      });
      return updated;
    });
  }
}
