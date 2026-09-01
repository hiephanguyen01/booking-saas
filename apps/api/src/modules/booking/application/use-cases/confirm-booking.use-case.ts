import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TenantDbService,
  type PrismaTx,
} from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ReservePromotionUseCase } from '../../../promotions/application/use-cases/reserve-promotion.use-case';
import { PromoRejectionError } from '../../../promotions/domain/errors/promo-rejection-errors';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { SlotTakenError } from '../../domain/booking-errors';
import { Booking } from '../../domain/entities/booking.entity';
import {
  BookingNotFound,
  BookingStateChanged,
} from '../../domain/errors/booking-domain-errors';

/**
 * Confirm a paid booking (§8.2 pending_payment → confirmed). Task 1.9's webhook
 * calls {@link execute} once the payment is durably recorded as succeeded (the
 * atomic pending→succeeded flip gates it to exactly one confirm attempt).
 *
 * Also handles the **late-webhook restore** edge (§8.2 row 665, expired →
 * confirmed): a success webhook that arrives after the booking expired. If the
 * slot is still free it re-reserves the promo redemption alongside the confirm;
 * if the slot was taken in the meantime it auto-creates a refund + notifies the
 * customer instead of surfacing a 500.
 */
@Injectable()
export class ConfirmBookingUseCase {
  private readonly logger = new Logger(ConfirmBookingUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    private readonly reservePromotion: ReservePromotionUseCase,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<BookingRecord> {
    try {
      return await this.tenantDb.forTenant(tenantId, (tx) =>
        this.confirmInTx(tx, tenantId, bookingId),
      );
    } catch (err) {
      // §8.2 row 665: a late webhook found the slot already taken — the confirm tx
      // rolled back untouched. Don't 500: refund the paid amount + notify (below).
      if (err instanceof SlotTakenError) return this.autoRefundSlotTaken(tenantId, bookingId);
      if (err instanceof BookingStateChanged) {
        return this.recoverConfirmationRace(tenantId, bookingId, err);
      }
      throw err;
    }
  }

  /** Confirm within the tenant transaction opened by {@link execute}. */
  private async confirmInTx(
    tx: PrismaTx,
    tenantId: string,
    bookingId: string,
  ): Promise<BookingRecord> {
    const booking = await this.bookings.findById(tx, bookingId);
    if (!booking) throw new BookingNotFound();
    const plan = Booking.rehydrate(booking).planConfirmation();
    // Outbox delivery is at-least-once. A later Finance handler may fail after
    // this handler already confirmed the booking, so retries must be harmless.
    if (plan.kind !== 'transition') return booking;

    // Re-entering an active state re-checks the exclusion constraint — for an
    // expired→confirmed restore this throws SlotTakenError if the slot was taken.
    const confirmed = await this.bookings.applyTransition(tx, plan.intent);

    // §8.2 row 665: on a late-webhook restore the promo redemption was released
    // at expiry — re-reserve it (re-increment redeemed_count) so the discount the
    // customer received is accounted for again. Mirrors create-booking's in-tx
    // reserve. A now-exhausted promo (claim refused) is tolerated: the confirm
    // itself must not fail for a promo-bookkeeping edge (§8.2 accepts overshoot).
    if (plan.wasExpired && plan.promoReservation) {
      try {
        await this.reservePromotion.execute(tx, tenantId, {
          ...plan.promoReservation,
          // The discount was already granted at booking time — a late-webhook restore
          // must not re-block on the per-customer cap (§8.2 accepts a temporary overshoot).
          usageLimitPerCustomer: null,
        });
      } catch (err) {
        if (err instanceof PromoRejectionError && err.code === 'PROMO_LIMIT_REACHED') {
          this.logger.warn(`promo re-reserve skipped for booking ${bookingId}: ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'booking.confirmed',
      payload: { bookingId, code: confirmed.code },
    });
    return confirmed;
  }

  /**
   * A refund intent can win after the initial read but before the expired restore
   * CAS. Re-read in a fresh transaction and accept only a state that no longer
   * needs confirmation; every unrelated state race keeps the original failure.
   */
  private async recoverConfirmationRace(
    tenantId: string,
    bookingId: string,
    cause: BookingStateChanged,
  ): Promise<BookingRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();
      if (Booking.rehydrate(booking).planConfirmation().kind !== 'transition') return booking;
      throw cause;
    });
  }

  /**
   * Slot taken during a late-webhook restore (§8.2 row 665): open a fresh tx (the
   * confirm tx is poisoned by the exclusion violation) and emit `booking.cancelled`
   * with a full refund — reusing the payments module's cancellation→refund handler
   * and the notification path. Idempotent downstream (refund is per-booking).
   */
  private async autoRefundSlotTaken(tenantId: string, bookingId: string): Promise<BookingRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();
      const aggregate = Booking.rehydrate(booking);
      this.logger.warn(
        `late webhook for booking ${bookingId}: slot taken — auto-refunding the service and security deposits`,
      );
      const refundAmount = aggregate.lateSlotRefundAmount();
      const refundPending = await this.bookings.recordRefundIntent(tx, {
        id: bookingId,
        expectedStatus: 'expired',
        refundDueAmount: refundAmount,
        refundPercent: 100,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'booking.cancelled',
        payload: {
          bookingId,
          code: booking.code,
          // Checkout charged both amounts in one gateway transaction. Omitting
          // the security deposit here would leave customer money stranded after
          // a late webhook loses the slot.
          refundAmount: refundAmount.toString(),
          refundPercent: 100,
        },
      });
      return refundPending;
    });
  }
}
