import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { ConfirmBookingUseCase } from '../../../booking/application/use-cases/confirm-booking.use-case';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { amountMatches } from '../../domain/payment-status';
import { GatewayRegistry } from '../../infrastructure/gateway-registry';

/**
 * The webhook — the single source of truth for payment (§11.2). Resolves the
 * tenant from the gateway txn (admin pool), verifies the signature, is idempotent
 * (an atomic pending→succeeded flip means 5 duplicate deliveries record one
 * payment and confirm once), guards the amount, then confirms the booking.
 */
@Injectable()
export class HandleWebhookUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    private readonly registry: GatewayRegistry,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(gatewayKey: GatewayKey, rawBody: Buffer, headers: Record<string, string>): Promise<void> {
    const ref = this.registry.statelessByKey(gatewayKey).peekReference(rawBody);
    if (!ref) throw new BadRequestException({ statusCode: 400, code: 'BAD_WEBHOOK', message: 'Unparseable webhook' });

    const payment = await this.payments.findByGatewayTxnId(ref);
    if (!payment) return; // unknown txn — acknowledge and ignore

    await this.tenantDb.forTenant(payment.tenantId, async (tx) => {
      const gateway = await this.registry.resolveForTenant(tx, payment.tenantId);
      const v = gateway.verifyWebhook(rawBody, headers);
      if (!v.valid) throw new UnauthorizedException({ statusCode: 401, code: 'INVALID_SIGNATURE', message: 'Webhook signature invalid' });

      if (v.event !== 'succeeded') {
        // One-way: a late failed/expired only applies while still pending.
        if (payment.status === 'pending') {
          await this.payments.updateStatus(tx, payment.id, v.event === 'expired' ? 'expired' : 'failed');
        }
        return;
      }
      if (!amountMatches(payment.amount, v.amountVnd)) {
        throw new BadRequestException({ statusCode: 400, code: 'AMOUNT_MISMATCH', message: 'Paid amount is less than expected' });
      }
      // Atomic: flip the payment AND confirm the booking in ONE tx, so the expiry
      // sweep can never expire a paid booking between two separate transactions.
      const flipped = await this.payments.markSucceeded(tx, payment.id, utcNow(), { event: v.event, amountVnd: v.amountVnd.toString() });
      if (!flipped) return; // duplicate delivery — already succeeded + confirmed
      try {
        await this.confirmBooking.confirmInTx(tx, payment.tenantId, payment.bookingId);
      } catch {
        // Booking already left pending_payment (raced the expiry sweep). Payment
        // stands; §8.2 late-webhook restore / auto-refund is a follow-up.
      }
    });
  }
}
