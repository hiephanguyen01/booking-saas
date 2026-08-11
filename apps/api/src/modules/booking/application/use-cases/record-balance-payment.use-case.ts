import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';

/**
 * A payment landed on an already-confirmed booking, i.e. a BALANCE payment
 * (§8.3): add it to `paid_amount` and change nothing else. Returns whether it
 * handled the event, so the caller knows not to run confirmation as well.
 *
 * Deliberately NOT `ConfirmBookingUseCase`, which **sets** `paid_amount` to the
 * deposit — routing a second payment through it would reset the total and lose
 * the balance. The status stays `confirmed`: money arriving is not a state
 * transition.
 *
 * The amount is derived, not passed in. `Payment.planBalance` bills exactly
 * `final_amount − paid_amount`, so the outstanding figure *is* the payment
 * amount, and deriving it keeps this module out of the payments table. It also
 * makes redelivery harmless twice over: the outstanding is 0 on the second run,
 * and the repository's guarded UPDATE would refuse an overshoot anyway.
 */
@Injectable()
export class RecordBalancePaymentUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<boolean> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking || booking.status !== 'confirmed') return false;
      const outstanding = booking.finalAmount - booking.paidAmount;
      if (outstanding <= 0n) return true;
      await this.bookings.addPaidAmount(tx, bookingId, outstanding);
      return true;
    });
  }
}
