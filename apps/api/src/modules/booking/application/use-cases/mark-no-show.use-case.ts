import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { isWithinNoShowWindow, NO_SHOW_WINDOW_HOURS } from '../../domain/no-show-window';
import { applyPartnerTransition } from '../apply-partner-transition';
import type { PartnerContext } from '../partner-owned-booking';

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
        guard: (booking) => this.assertNoShowWindow(booking),
      },
    );
  }

  /**
   * §8.5: the partner may mark `no_show` only once the slot has ended and only
   * within {@link NO_SHOW_WINDOW_HOURS}h of `timeslot.end` — past that a job has
   * (or is about to) auto-complete the booking, so a late mark would race it.
   */
  private assertNoShowWindow(booking: BookingRecord): void {
    if (!isWithinNoShowWindow(booking.endUtc, utcNow())) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'NO_SHOW_WINDOW_INVALID',
        message: `A booking can only be marked no-show after it ends and within ${NO_SHOW_WINDOW_HOURS}h of the end time`,
      });
    }
  }
}
