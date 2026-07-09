import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { REFUND_REPOSITORY, type IRefundRepository } from '../../domain/ports/refund-repository.port';
import { GatewayRegistry } from '../../infrastructure/gateway-registry';

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
    private readonly registry: GatewayRegistry,
    private readonly tenantDb: TenantDbService,
  ) {}

  async handle(tenantId: string, bookingId: string, amount: bigint): Promise<void> {
    if (amount <= 0n) return;
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      // Serialise concurrent refund handlers for a booking (cancelled + returned
      // both trigger this) so two deliveries can't both pass the exists-check and
      // double-refund at the gateway.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('refund:' || ${bookingId}))`);
      if (await this.refunds.existsForBooking(tx, bookingId)) return; // idempotent
      const payment = await this.payments.findSucceededByBooking(tx, bookingId);
      if (!payment?.gatewayTxnId) return; // nothing was paid to refund

      const gateway = await this.registry.resolveForTenant(tx, tenantId);
      const res = await gateway.refund({ gatewayTxnId: payment.gatewayTxnId, amountVnd: amount, reason: 'booking refund' });
      await this.refunds.create(tx, tenantId, {
        paymentId: payment.id,
        bookingId,
        amount,
        status: res.supported ? 'succeeded' : 'manual_required',
        gatewayRefundId: res.refundId ?? null,
      });
    });
  }
}
