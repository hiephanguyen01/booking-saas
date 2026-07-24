import type { GatewayKey, WebhookEvent } from '../ports/payment-gateway.port';
import { MOMO_MAX_PAYMENT_VND } from '../gateway-limits';
import { amountMatches } from '../payment-status';
import {
  AmountExceedsGatewayLimit,
  AmountMismatch,
  BookingNotPayable,
  NoActiveGateway,
} from '../errors/payment-errors';

/**
 * Payment aggregate policy (§11.2). Holds ONLY the stateless write rules that
 * checkout + the webhook used to inline — booking-payability, the amount/kind
 * plan, gateway acceptance, the webhook event routing, and the amount guard.
 *
 * Deliberately has NO instance state and NO status-based transition method: the
 * payment lifecycle flip (`pending → succeeded`, `pending → failed/expired`) is a
 * compare-and-set that MUST stay in the repository (`markSucceeded` /
 * `markTerminalIfPending`, spec §2.8). A snapshot of `status` loaded before the tx
 * cannot be trusted under concurrent webhook deliveries (see handle-webhook
 * :62-66) — the entity only *decides which* transition the caller should attempt;
 * the atomic guarded UPDATE decides *whether* it actually applies.
 *
 * Framework-free: no Nest, no Prisma, no clock, no randomness.
 */
export class Payment {
  private constructor() {}

  /** A payment can only be created while the booking is awaiting payment. */
  static assertPayable(booking: { status: string }): void {
    if (booking.status !== 'pending_payment') {
      throw new BookingNotPayable(booking.status);
    }
  }

  /**
   * The checkout amount = deposit + security deposit (the security deposit is
   * refunded on return, §9.4). `kind` is `full` when the deposit already covers
   * the final amount, otherwise a partial `deposit`.
   */
  static plan(booking: {
    depositAmount: bigint;
    securityDeposit: bigint;
    finalAmount: bigint;
  }): { amount: bigint; kind: 'full' | 'deposit' } {
    const amount = booking.depositAmount + booking.securityDeposit;
    const kind = booking.depositAmount >= booking.finalAmount ? 'full' : 'deposit';
    return { amount, kind };
  }

  /**
   * Gateway-acceptance guards, in the original checkout order:
   *   1. The registry falls back to `mock` when no gateway is configured. That is
   *      only acceptable in dev/test; in production, refuse rather than silently
   *      take fake payments.
   *   2. MoMo caps a single payment/refund at 50M VND — reject over-limit orders
   *      up front so every MoMo booking stays fully auto-refundable (refund ≤ amount).
   */
  static assertGatewayAccepts(input: {
    gatewayKey: GatewayKey;
    amount: bigint;
    isProductionEnv: boolean;
    allowMockPayments: boolean;
  }): void {
    if (input.gatewayKey === 'mock' && input.isProductionEnv && !input.allowMockPayments) {
      throw new NoActiveGateway();
    }
    if (input.gatewayKey === 'momo' && input.amount > MOMO_MAX_PAYMENT_VND) {
      throw new AmountExceedsGatewayLimit();
    }
  }

  /**
   * Route a verified webhook event to the transition the caller should attempt:
   *   - `refunded` → ignore (a SePay TRANSACTION_VOID confirms a recorded refund;
   *     it must never downgrade the original successful payment);
   *   - any non-`succeeded` event → a terminal `failed`/`expired` (applied only
   *     while still pending, via the repo's guarded write);
   *   - `succeeded` → attempt the pending → succeeded flip.
   */
  static decideWebhookTransition(
    event: WebhookEvent,
  ):
    | { action: 'ignore' }
    | { action: 'terminal'; to: 'failed' | 'expired' }
    | { action: 'try_succeed' } {
    if (event === 'refunded') return { action: 'ignore' };
    if (event !== 'succeeded') {
      return { action: 'terminal', to: event === 'expired' ? 'expired' : 'failed' };
    }
    return { action: 'try_succeed' };
  }

  /** The webhook must match the paid amount against the expected amount (underpay rejects). */
  static assertAmountCovers(expected: bigint, paid: bigint): void {
    if (!amountMatches(expected, paid)) {
      throw new AmountMismatch();
    }
  }
}
