import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(HandleWebhookUseCase.name);

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

    // Record the payment durably first (its own tx). markSucceeded is an atomic
    // pending→succeeded flip, so 5 duplicate deliveries return `true` exactly once.
    const flipped = await this.tenantDb.forTenant(payment.tenantId, async (tx) => {
      const gateway = await this.registry.resolveForTenant(tx, payment.tenantId);
      const v = gateway.verifyWebhook(rawBody, headers);
      if (!v.valid) throw new UnauthorizedException({ statusCode: 401, code: 'INVALID_SIGNATURE', message: 'Webhook signature invalid' });

      if (v.event !== 'succeeded') {
        // One-way machine (§11.2): a late/out-of-order failed/expired only applies
        // while still pending. The write is atomic (UPDATE ... WHERE status =
        // 'pending'), so a concurrent succeeded delivery is never clobbered — the
        // pre-tx snapshot can't be trusted under concurrent webhooks.
        await this.payments.markTerminalIfPending(tx, payment.id, v.event === 'expired' ? 'expired' : 'failed');
        return false;
      }
      if (!amountMatches(payment.amount, v.amountVnd)) {
        throw new BadRequestException({ statusCode: 400, code: 'AMOUNT_MISMATCH', message: 'Paid amount is less than expected' });
      }
      return this.payments.markSucceeded(tx, payment.id, utcNow(), { event: v.event, amountVnd: v.amountVnd.toString() });
    });

    if (!flipped) return; // duplicate delivery — already recorded (and confirmed once)

    // Payment is committed; confirm the booking in its own tx. execute() covers both
    // pending_payment→confirmed and the expired→confirmed late-restore, and — if the
    // slot was taken in the gap — auto-refunds + notifies (§8.2 row 665) instead of
    // losing the customer's money. Runs exactly once (gated on the atomic flip above).
    try {
      await this.confirmBooking.execute(payment.tenantId, payment.bookingId);
    } catch (err) {
      // execute() already absorbs SlotTaken (auto-refund); anything else is a bug —
      // the payment stands and the reconciliation sweep is the backstop. Don't storm
      // the gateway with a 500 that would only re-deliver into the no-op flip.
      this.logger.error(`confirm after webhook failed for booking ${payment.bookingId}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
