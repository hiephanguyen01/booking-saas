import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { addMinutes, utcNow } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { applyPartnerTransition } from '../apply-partner-transition';
import type { PartnerContext } from '../partner-owned-booking';

/** Partner approves a pending booking (§8.2 pending_approval → pending_payment). */
@Injectable()
export class ApproveBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(ctx: PartnerContext, bookingId: string): Promise<BookingRecord> {
    return applyPartnerTransition(
      { bookings: this.bookings, tenantDb: this.tenantDb, outbox: this.outbox },
      ctx,
      bookingId,
      'pending_payment',
      'booking.approved',
      { expiresAt: addMinutes(utcNow(), 15) },
    );
  }
}
