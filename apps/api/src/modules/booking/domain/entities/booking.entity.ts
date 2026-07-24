import type { BookingStatus } from '@booking/contracts';
import { addMinutes } from '../../../../shared/time/time';
import { assertTransition, type TransitionActor } from '../booking-state-machine';
import {
  BookingListingNotFound,
  BookingModeNotEnabled,
  BookingNotInventory,
  BookingNotOwned,
  BookingOutOfStock,
  BookingPriceChanged,
  BookingServiceNotEnded,
  BookingStateChanged,
  InventoryRequiresReturn,
  InvalidNoShowWindow,
  OnsiteAmountMismatch,
} from '../errors/booking-domain-errors';
import { remainingStock } from '../inventory-stock';
import { isWithinNoShowWindow, NO_SHOW_WINDOW_HOURS } from '../no-show-window';
import { BookingMoney } from '../value-objects/booking-money.value-object';
import {
  FulfillmentState,
  type InventoryFulfillmentSettings,
} from '../value-objects/fulfillment-state.value-object';

export interface BookingWriteState {
  id: string;
  partnerId: string;
  listingId: string;
  customerId: string;
  code: string;
  status: BookingStatus;
  bookingMode: string;
  startUtc: Date;
  endUtc: Date;
  quantity: number;
  finalAmount: bigint;
  discountAmount: bigint;
  depositAmount: bigint;
  paidAmount: bigint;
  securityDeposit: bigint;
  additionalCharges: unknown;
  cancellationPolicySnapshot: unknown;
  promotionId: string | null;
}

export interface BookingTransitionIntent {
  id: string;
  from: BookingStatus;
  to: BookingStatus;
  actor: TransitionActor;
  actorId?: string | null;
  reason?: string | null;
  expiresAt?: Date | null;
  paidAmount?: bigint;
  refundDueAmount?: bigint;
  refundPercent?: number;
}

/**
 * Booking write aggregate.
 *
 * It owns lifecycle and settlement decisions, while persistence remains an
 * optimistic compare-and-set in the repository. In particular, this entity
 * cannot decide GiST availability, inventory counts, or idempotency races from
 * an in-memory snapshot.
 */
export class Booking {
  private constructor(private readonly state: BookingWriteState) {}

  static rehydrate(state: BookingWriteState): Booking {
    return new Booking(state);
  }

  static assertListingBookable(
    listing: { status: string; bookingModes: readonly string[] } | null,
    mode: string,
  ): asserts listing is { status: string; bookingModes: readonly string[] } {
    if (!listing || listing.status !== 'published') throw new BookingListingNotFound();
    if (!listing.bookingModes.includes(mode)) throw new BookingModeNotEnabled(mode);
  }

  static assertExpectedSubtotal(expected: string | undefined, current: string): void {
    if (expected && current !== expected) throw new BookingPriceChanged(expected, current);
  }

  static assertInventoryCapacity(stock: number, used: number, requested: number): void {
    if (requested < 1 || used + requested > stock) {
      throw new BookingOutOfStock(remainingStock(stock, used));
    }
  }

  static activationPlan(
    approvalRequired: boolean,
    now: Date,
  ): { to: 'pending_approval' | 'pending_payment'; expiresAt: Date } {
    return approvalRequired
      ? { to: 'pending_approval', expiresAt: addMinutes(now, 24 * 60) }
      : { to: 'pending_payment', expiresAt: addMinutes(now, 15) };
  }

  assertOwnedBy(partnerId: string): void {
    if (this.state.partnerId !== partnerId) throw new BookingNotOwned();
  }

  transitionTo(
    to: BookingStatus,
    actor: TransitionActor,
    patch: Omit<BookingTransitionIntent, 'id' | 'from' | 'to' | 'actor'> = {},
  ): BookingTransitionIntent {
    assertTransition(this.state.status, to, actor);
    return {
      id: this.state.id,
      from: this.state.status,
      to,
      actor,
      ...patch,
    };
  }

  cancellationSettlement(
    actor: TransitionActor,
    now: Date,
  ): {
    refundAmount: bigint;
    refundPercent: number;
  } {
    return BookingMoney.cancellationSettlement({
      actor,
      paidAmount: this.state.paidAmount,
      securityDeposit: this.state.securityDeposit,
      startUtc: this.state.startUtc,
      now,
      policySnapshot: this.state.cancellationPolicySnapshot,
    });
  }

  planConfirmation():
    | { kind: 'already_confirmed' }
    | {
        kind: 'transition';
        intent: BookingTransitionIntent;
        wasExpired: boolean;
        promoReservation: {
          promotionId: string;
          bookingId: string;
          customerId: string;
          discountAmount: bigint;
        } | null;
      } {
    if (['confirmed', 'completed', 'no_show'].includes(this.state.status)) {
      return { kind: 'already_confirmed' };
    }
    return {
      kind: 'transition',
      intent: this.transitionTo('confirmed', 'system', {
        expiresAt: null,
        paidAmount: this.state.depositAmount,
      }),
      wasExpired: this.state.status === 'expired',
      promoReservation: this.state.promotionId
        ? {
            promotionId: this.state.promotionId,
            bookingId: this.state.id,
            customerId: this.state.customerId,
            discountAmount: this.state.discountAmount,
          }
        : null,
    };
  }

  lateSlotRefundAmount(): bigint {
    return this.state.depositAmount + this.state.securityDeposit;
  }

  assertNoShowAllowed(now: Date): void {
    if (!isWithinNoShowWindow(this.state.endUtc, now)) {
      throw new InvalidNoShowWindow(NO_SHOW_WINDOW_HOURS);
    }
  }

  assertNonInventoryCompletion(): void {
    if (this.state.bookingMode === 'inventory') throw new InventoryRequiresReturn();
  }

  planCompletion(
    now: Date,
    onsiteCollectedAmount: bigint,
    actorId: string,
    note?: string,
  ): BookingTransitionIntent {
    if (now < this.state.endUtc) throw new BookingServiceNotEnded();
    const intent = this.transitionTo('completed', 'partner', {
      actorId,
      reason: note?.trim() || 'partner confirmed service completion',
    });
    const expected = BookingMoney.outstandingOnsite(
      this.state.finalAmount,
      this.state.additionalCharges,
      this.state.paidAmount,
    );
    if (onsiteCollectedAmount !== expected) {
      throw new OnsiteAmountMismatch(onsiteCollectedAmount, expected);
    }
    return intent;
  }

  fulfillment(): FulfillmentState {
    return FulfillmentState.rehydrate({
      status: this.state.status,
      bookingMode: this.state.bookingMode,
      endUtc: this.state.endUtc,
      quantity: this.state.quantity,
      securityDeposit: this.state.securityDeposit,
    });
  }

  /** Guard before the DB-clock lookup so the legacy error/query order remains intact. */
  assertPickupAllowed(): void {
    this.fulfillment().planPickup(this.state.endUtc);
  }

  /** Guard before DB-clock/listing I/O; the returned intent remains the repository CAS input. */
  assertReturnable(actorId: string): BookingTransitionIntent {
    if (this.state.bookingMode !== 'inventory') throw new BookingNotInventory();
    if (this.state.status !== 'confirmed') throw new BookingStateChanged();
    return this.transitionTo('completed', 'partner', {
      actorId,
      reason: 'inventory returned',
    });
  }

  planReturn(
    now: Date,
    damageAmount: bigint,
    settings: InventoryFulfillmentSettings | undefined,
    actorId: string,
  ): {
    patch: { returnedAt: Date; damageAmount: bigint; additionalCharges?: unknown };
    completion: BookingTransitionIntent;
    lateFee: bigint;
    depositRefund: bigint;
    depositShortfall: bigint;
  } {
    const result = this.fulfillment().planReturn(now, damageAmount, settings);
    return {
      ...result,
      completion: this.assertReturnable(actorId),
    };
  }

  planRefundFinalization(): BookingTransitionIntent | null {
    if (this.state.status === 'refunded') return null;
    return this.transitionTo('refunded', 'system', {
      reason: 'refund transfer confirmed',
    });
  }

  normalisePartnerNote(note: string | null): string | null {
    return note;
  }
}
