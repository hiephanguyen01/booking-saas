import type { GatewayKey, WebhookEvent } from '../ports/payment-gateway.port';
import { MOMO_MAX_PAYMENT_VND, MOMO_MIN_PAYMENT_VND } from '../gateway-limits';
import { amountMatches } from '../payment-status';
import {
  AmountBelowGatewayMinimum,
  AmountExceedsGatewayLimit,
  AmountMismatch,
  BookingNotPayable,
  NoActiveGateway,
  NothingLeftToPay,
} from '../errors/payment-errors';

/**
 * Payment aggregate policy (§11.2). Holds stateless write rules only; atomic
 * lifecycle compare-and-set stays in the repository.
 */
export class Payment {
  private constructor() {}

  static assertPayable(booking: { status: string }): void {
    if (booking.status !== 'pending_payment') throw new BookingNotPayable(booking.status);
  }

  static plan(booking: {
    depositAmount: bigint;
    securityDeposit: bigint;
    finalAmount: bigint;
  }): { amount: bigint; kind: 'full' | 'deposit' } {
    const amount = booking.depositAmount + booking.securityDeposit;
    const kind = booking.depositAmount >= booking.finalAmount ? 'full' : 'deposit';
    return { amount, kind };
  }

  static assertBalancePayable(booking: {
    status: string;
    finalAmount: bigint;
    paidAmount: bigint;
  }): void {
    if (booking.status !== 'confirmed') throw new BookingNotPayable(booking.status);
    if (booking.finalAmount - booking.paidAmount <= 0n) throw new NothingLeftToPay();
  }

  static planBalance(booking: { finalAmount: bigint; paidAmount: bigint }): {
    amount: bigint;
    kind: 'balance';
  } {
    return { amount: booking.finalAmount - booking.paidAmount, kind: 'balance' };
  }

  static assertGatewayAccepts(input: {
    gatewayKey: GatewayKey;
    amount: bigint;
    isProductionEnv: boolean;
    allowMockPayments: boolean;
  }): void {
    if (input.gatewayKey === 'mock' && input.isProductionEnv && !input.allowMockPayments) {
      throw new NoActiveGateway();
    }
    if (input.gatewayKey === 'momo' && input.amount < MOMO_MIN_PAYMENT_VND) {
      throw new AmountBelowGatewayMinimum();
    }
    if (input.gatewayKey === 'momo' && input.amount > MOMO_MAX_PAYMENT_VND) {
      throw new AmountExceedsGatewayLimit();
    }
  }

  static decideWebhookTransition(
    event: WebhookEvent,
  ):
    | { action: 'ignore' }
    | { action: 'terminal'; to: 'failed' | 'expired' }
    | { action: 'try_succeed' } {
    if (event === 'pending' || event === 'refunded') return { action: 'ignore' };
    if (event !== 'succeeded') {
      return { action: 'terminal', to: event === 'expired' ? 'expired' : 'failed' };
    }
    return { action: 'try_succeed' };
  }

  static assertAmountMatches(expected: bigint, paid: bigint): void {
    if (!amountMatches(expected, paid)) throw new AmountMismatch();
  }
}
