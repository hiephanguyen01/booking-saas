import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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

      if (amount > payment.amount) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'REFUND_AMOUNT_EXCEEDS_PAYMENT',
          message: 'Refund amount exceeds the captured payment',
        });
      }

      const config = await this.configs.findActiveBase(tx, tenantId);
      const settings = config?.settings ?? DEFAULT_GATEWAY_PAYMENT_SETTINGS;
      // SePay only auto-voids a full card charge (no partial refunds).
      const isSepayCardFull =
        payment.gateway === 'sepay' && payment.paymentMethod === 'CARD' && amount === payment.amount;
      // MoMo can auto-refund any (incl. partial) order amount to the wallet.
      const isMomo = payment.gateway === 'momo';
      // The security deposit is never auto-refunded (manual path for both gateways).
      const automatic =
        settings.refundStrategy === 'automatic_preferred' &&
        reason !== 'security_deposit' &&
        (isSepayCardFull || isMomo);

      const dueAt = automatic
        ? null
        : new Date(Date.now() + settings.manualRefundSlaHours * 60 * 60 * 1000);
      const refund = await this.refunds.create(tx, tenantId, {
        paymentId: payment.id,
        bookingId,
        amount,
        status: automatic ? 'pending' : 'manual_required',
        affectsBookingStatus,
        reason,
        gatewayRefundId: null,
        executionMode: automatic ? 'automatic' : 'manual',
        dueAt,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: automatic ? 'refund.execution_requested' : 'refund.requested',
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
