import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_GATEWAY_PAYMENT_SETTINGS } from '@booking/contracts';
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
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import { Refund } from '../../domain/entities/refund.entity';

/**
 * Execute a refund (§11.3). Triggered by `booking.cancelled` / `booking.returned`
 * outbox events (registered in the module). Calls the gateway's refund API; when
 * unsupported it records `manual_required` for the tenant to transfer by hand.
 * Idempotent per booking. Ledger entries are Task 1.10.
 */
@Injectable()
export class ExecuteRefundUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
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
      // Serialise concurrent refund handlers for a booking (cancelled + returned
      // both trigger this) so two deliveries can't both pass the exists-check and
      // double-refund at the gateway.
      await this.refunds.lockForBooking(tx, bookingId);
      if (await this.refunds.existsForBooking(tx, bookingId, reason)) return; // idempotent
      const payment = await this.payments.findSucceededByBooking(tx, bookingId);
      if (!payment) return; // nothing was paid to refund

      // With parallel gateways the base config's settings don't reflect a wallet
      // payment's own refund strategy — always read the config for the PAYMENT's
      // own gateway.
      const config = await this.configs.findByGateway(tx, tenantId, payment.gateway);
      const settings = config?.settings ?? DEFAULT_GATEWAY_PAYMENT_SETTINGS;
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
        settings,
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
