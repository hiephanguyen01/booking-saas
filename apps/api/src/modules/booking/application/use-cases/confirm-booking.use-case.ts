import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ApplyPromotionService } from '../../../promotions/application/apply-promotion.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';
import { SlotTakenError } from '../../domain/booking-errors';

/**
 * Confirm a paid booking (§8.2 pending_payment → confirmed). Task 1.9's webhook
 * calls {@link confirmInTx} INSIDE the same tenant tx that flips the payment to
 * succeeded, so payment-succeeded and booking-confirmed commit atomically —
 * closing the race where the expiry sweep could expire an already-paid booking.
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
    private readonly promotions: ApplyPromotionService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<BookingRecord> {
    try {
      return await this.tenantDb.forTenant(tenantId, (tx) => this.confirmInTx(tx, tenantId, bookingId));
    } catch (err) {
      // §8.2 row 665: a late webhook found the slot already taken — the confirm tx
      // rolled back untouched. Don't 500: refund the paid amount + notify (below).
      if (err instanceof SlotTakenError) return this.autoRefundSlotTaken(tenantId, bookingId);
      throw err;
    }
  }

  /** Confirm within an existing tenant transaction (caller owns the tx). */
  async confirmInTx(tx: PrismaTx, tenantId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await this.bookings.findById(tx, bookingId);
    if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    assertTransition(booking.status, 'confirmed', 'system');
    const wasExpired = booking.status === 'expired';

    // Re-entering an active state re-checks the exclusion constraint — for an
    // expired→confirmed restore this throws SlotTakenError if the slot was taken.
    const confirmed = await this.bookings.applyTransition(tx, {
      id: bookingId,
      from: booking.status,
      to: 'confirmed',
      actor: 'system',
      expiresAt: null,
      paidAmount: booking.depositAmount,
    });

    // §8.2 row 665: on a late-webhook restore the promo redemption was released
    // at expiry — re-reserve it (re-increment redeemed_count) so the discount the
    // customer received is accounted for again. Mirrors create-booking's in-tx
    // reserve. A now-exhausted promo (claim refused) is tolerated: the confirm
    // itself must not fail for a promo-bookkeeping edge (§8.2 accepts overshoot).
    if (wasExpired && booking.promotionId) {
      try {
        await this.promotions.reserve(tx, tenantId, {
          promotionId: booking.promotionId,
          bookingId: booking.id,
          customerId: booking.customerId,
          discountAmount: booking.discountAmount,
        });
      } catch (err) {
        if (err instanceof ConflictException) {
          this.logger.warn(`promo re-reserve skipped for booking ${bookingId}: ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    await this.outbox.emit(tx, { tenantId, eventType: 'booking.confirmed', payload: { bookingId, code: confirmed.code } });
    return confirmed;
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
      if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      this.logger.warn(`late webhook for booking ${bookingId}: slot taken — auto-refunding the deposit`);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'booking.cancelled',
        payload: {
          bookingId,
          code: booking.code,
          // Refund the full deposit the customer paid; retained portion = 0 → no
          // cancellation fee journal (finance handler is a no-op at 100%).
          refundAmount: booking.depositAmount.toString(),
          refundPercent: 100,
        },
      });
      return booking;
    });
  }
}
