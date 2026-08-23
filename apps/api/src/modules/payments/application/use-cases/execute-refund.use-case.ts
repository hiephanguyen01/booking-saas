import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/ports/payment-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../../domain/ports/refund-repository.port';
import {
  GATEWAY_REGISTRY,
  type GatewayRegistryPort,
} from '../../domain/ports/gateway-registry.port';
import { Refund } from '../../domain/entities/refund.entity';
import {
  paymentRefundPolicySnapshot,
  resolvePaymentRefundPolicy,
} from '../../domain/refund-policy-resolution';

/**
 * Plan a refund intent from the source Payment's frozen policy. Provider execution
 * happens later in ExecuteAutomaticRefundUseCase; this transaction only creates
 * the durable intent and its outbox request.
 */
@Injectable()
export class ExecuteRefundUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    amount: bigint,
    reason = 'booking_cancellation',
    affectsBookingStatus = reason !== 'security_deposit',
  ): Promise<void> {
    if (amount <= 0n) return;
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.refunds.lockForBooking(tx, bookingId);
      if (await this.refunds.existsForBooking(tx, bookingId, reason)) return;
      const payment = await this.payments.findSucceededByBooking(tx, bookingId);
      if (!payment) return;

      // A complete snapshot is authoritative and a partial snapshot fails closed
      // before any historical credential/config resolution. Only legacy Payments
      // with `(null, null)` consult their immutable gateway revision settings.
      let policy = paymentRefundPolicySnapshot(payment);
      if (!policy) {
        const resolved = await this.registry.resolveForPayment(tx, payment);
        policy = resolvePaymentRefundPolicy(payment, resolved.settings);
      }

      const planned = Refund.plan({
        payment: {
          id: payment.id,
          amount: payment.amount,
          gateway: payment.gateway,
          paymentMethod: payment.paymentMethod,
        },
        bookingId,
        amount,
        reason,
        affectsBookingStatus,
        settings: policy,
        now: new Date(),
      });
      const refund = await this.refunds.create(tx, tenantId, planned);
      await this.outbox.emit(tx, {
        tenantId,
        eventType:
          planned.executionMode === 'automatic' ? 'refund.execution_requested' : 'refund.requested',
        payload: {
          refundId: refund.id,
          paymentId: payment.id,
          bookingId,
          amount: amount.toString(),
          reason,
          affectsBookingStatus,
        },
      });
    });
  }
}
