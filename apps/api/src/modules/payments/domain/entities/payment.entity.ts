import type { GatewayKey, WebhookEvent } from '../ports/payment-gateway.port';
import { MOMO_MAX_PAYMENT_VND } from '../gateway-limits';
import { amountMatches } from '../payment-status';
import {
  AmountExceedsGatewayLimit,
  AmountMismatch,
  BookingNotPayable,
  NoActiveGateway,
  NothingLeftToPay,
} from '../errors/payment-errors';

/**
 * Payment aggregate policy (§11.2). Holds ONLY the stateless write rules that
 * checkout + the webhook used to inline — booking-payability, the amount/kind
 * plan, gateway acceptance, the webhook event routing, and the amount guard.
 *
 * Deliberately has NO instance state and NO status-based transition method: the
 * payment lifecycle flip (`non-succeeded → succeeded`, `pending → failed/expired`) is a
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
   * A balance payment is only legal on a booking that is already confirmed and
   * still owes money (§8.3). Deliberately separate from {@link assertPayable} so
   * the deposit path's `pending_payment` guard stays strict — widening that one
   * would let a cancelled or refunded booking take money.
   */
  static assertBalancePayable(booking: {
    status: string;
    finalAmount: bigint;
    paidAmount: bigint;
  }): void {
    if (booking.status !== 'confirmed') {
      throw new BookingNotPayable(booking.status);
    }
    if (booking.finalAmount - booking.paidAmount <= 0n) {
      throw new NothingLeftToPay();
    }
  }

  /**
   * What is still owed. `additional_charges` are excluded on purpose: they accrue
   * at completion, after the service, and settle on site — not through a
   * pre-service balance payment. The security deposit was already taken with the
   * deposit payment, so it is never charged twice.
   */
  static planBalance(booking: { finalAmount: bigint; paidAmount: bigint }): {
    amount: bigint;
    kind: 'balance';
  } {
    return { amount: booking.finalAmount - booking.paidAmount, kind: 'balance' };
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
   *   - `refunded` / `pending` → ignore;
   *   - final non-`succeeded` event → a terminal `failed`/`expired` (applied only
   *     while still pending, via the repo's guarded write);
   *   - `succeeded` → attempt the non-succeeded → succeeded flip (late success is valid).
   */
  static decideWebhookTransition(
    event: WebhookEvent,
  ):
    | { action: 'ignore' }
    | { action: 'terminal'; to: 'failed' | 'expired' }
    | { action: 'try_succeed' } {
    if (event === 'refunded' || event === 'pending') return { action: 'ignore' };
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
