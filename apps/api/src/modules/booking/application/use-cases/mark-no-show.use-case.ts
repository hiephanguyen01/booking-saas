import { Inject, Injectable } from '@nestjs/common';
import {
  TenantDbService,
  type PrismaTx,
} from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { applyPartnerTransition } from '../apply-partner-transition';
import type { PartnerContext } from '../partner-owned-booking';
import { Booking } from '../../domain/entities/booking.entity';

/** Partner marks a confirmed booking as a no-show (§8.2/§8.5 confirmed → no_show). */
@Injectable()
export class MarkNoShowUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(ctx: PartnerContext, bookingId: string, reason?: string): Promise<BookingRecord> {
    return applyPartnerTransition(
      { bookings: this.bookings, tenantDb: this.tenantDb, outbox: this.outbox },
      ctx,
      bookingId,
      'no_show',
      'booking.no_show',
      {
        reason,
        // §8.5: a no-show is only markable after the slot ends and within 48h of it.
        guard: (booking, tx) => this.assertNoShowWindow(tx, booking),
        // The customer never took custody of inventory, so its separately-held
        // security deposit must be returned even though the service deposit is
        // subject to the no-show settlement split.
        eventPayload: (booking) => ({ securityDeposit: booking.securityDeposit.toString() }),
      },
    );
  }

  /**
   * §8.5: the partner may mark `no_show` only once the slot has ended and only
   * within {@link NO_SHOW_WINDOW_HOURS}h of `timeslot.end`. Past that, an explicit
   * Tenant intervention is required; the scheduler never guesses completion.
   */
  private async assertNoShowWindow(tx: PrismaTx, booking: BookingRecord): Promise<void> {
    Booking.rehydrate(booking).assertNoShowAllowed(await this.tenantDb.databaseNow(tx));
  }
}
