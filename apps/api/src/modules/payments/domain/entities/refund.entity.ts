import type { GatewayPaymentSettings } from '@booking/contracts';
import type { GatewayKey } from '../ports/payment-gateway.port';
import type { RefundRecord } from '../ports/refund-repository.port';
import { RefundAmountExceedsPayment, RefundNotConfirmable } from '../errors/refund-errors';

/** The payment context a refund policy decision needs. */
export interface RefundPolicyInput {
  payment: { id: string; amount: bigint; gateway: GatewayKey; paymentMethod: string | null };
  bookingId: string;
  amount: bigint;
  reason: string;
  affectsBookingStatus: boolean;
  settings: GatewayPaymentSettings;
  now: Date;
}

/** The planned refund intent — the exact shape the repository's `create` persists. */
export interface NewRefund {
  paymentId: string;
  bookingId: string;
  amount: bigint;
  status: RefundRecord['status'];
  affectsBookingStatus: boolean;
  reason: string;
  gatewayRefundId: null;
  executionMode: RefundRecord['executionMode'];
  dueAt: Date | null;
}

/**
 * Refund aggregate policy (§11.3). Holds the stateless decision of HOW a refund
 * should run — automatic (gateway push) vs manual (tenant bank transfer) — and the
 * narrow status predicates the two-phase executor + manual confirmation branch on.
 *
 * Deliberately holds NO lifecycle-transition method: `pending → succeeded`
 * (`completeAutomatic` / `markSucceeded`) and `pending → manual_required`
 * (`requireManual`) are compare-and-set writes that MUST stay in the repository,
 * serialised by the per-booking advisory lock (§C). A snapshot loaded before the
 * tx cannot be trusted under the concurrent cancelled/returned deliveries that both
 * fan into a refund — the entity only *decides which* transition the caller should
 * attempt; the guarded UPDATE + lock decide *whether* it applies.
 *
 * Framework-free: no Nest, no Prisma, no clock (the caller passes `now`).
 */
export class Refund {
  private constructor(
    private readonly paymentId: string,
    private readonly status: RefundRecord['status'],
    private readonly executionMode: RefundRecord['executionMode'],
  ) {}

  /**
   * Plan a new refund intent for a captured payment.
   *   1. A refund can never exceed the captured amount.
   *   2. Automatic (gateway-push) only when the gateway can push money back AND the
   *      tenant opted into it: SePay auto-voids a *full* card charge (no partial
   *      refunds); MoMo/ZaloPay auto-refund any (incl. partial) wallet order. The
   *      security deposit is never auto-refunded (manual path for both gateways).
   *   3. Manual refunds carry an SLA `dueAt`; automatic ones settle synchronously.
   */
  static plan(input: RefundPolicyInput): NewRefund {
    if (input.amount > input.payment.amount) {
      throw new RefundAmountExceedsPayment();
    }
    const isSepayCardFull =
      input.payment.gateway === 'sepay' &&
      input.payment.paymentMethod === 'CARD' &&
      input.amount === input.payment.amount;
    const isWalletAuto = input.payment.gateway === 'momo' || input.payment.gateway === 'zalopay';
    const automatic =
      input.settings.refundStrategy === 'automatic_preferred' &&
      input.reason !== 'security_deposit' &&
      (isSepayCardFull || isWalletAuto);
    const dueAt = automatic
      ? null
      : Refund.manualDueAt(input.settings.manualRefundSlaHours, input.now);
    return {
      paymentId: input.payment.id,
      bookingId: input.bookingId,
      amount: input.amount,
      status: automatic ? 'pending' : 'manual_required',
      affectsBookingStatus: input.affectsBookingStatus,
      reason: input.reason,
      gatewayRefundId: null,
      executionMode: automatic ? 'automatic' : 'manual',
      dueAt,
    };
  }

  /** The SLA deadline for a manual refund, `slaHours` after `now`. */
  static manualDueAt(slaHours: number, now: Date): Date {
    return new Date(now.getTime() + slaHours * 60 * 60 * 1000);
  }

  static rehydrate(record: RefundRecord): Refund {
    return new Refund(record.paymentId, record.status, record.executionMode);
  }

  /** Still a pending automatic intent the executor may push to the gateway. */
  canExecuteAutomatically(): boolean {
    return this.status === 'pending' && this.executionMode === 'automatic';
  }

  /** Guards that the refund belongs to the still-latest succeeded payment. */
  isForPayment(payment: { id: string } | null): boolean {
    return payment !== null && payment.id === this.paymentId;
  }

  /**
   * Classify a manual-confirmation attempt: an already-succeeded refund is an
   * idempotent no-op; a `manual_required`/`pending` refund is confirmable; anything
   * else (failed) cannot be confirmed.
   */
  classifyConfirmation(): 'already_succeeded' | 'confirmable' {
    if (this.status === 'succeeded') return 'already_succeeded';
    if (!['manual_required', 'pending'].includes(this.status)) {
      throw new RefundNotConfirmable(this.status);
    }
    return 'confirmable';
  }
}
