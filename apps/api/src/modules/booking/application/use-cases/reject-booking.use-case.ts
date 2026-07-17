import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { applyPartnerTransition } from '../apply-partner-transition';
import type { PartnerContext } from '../partner-owned-booking';

/** Partner rejects a pending booking (§8.2 pending_approval → rejected). */
@Injectable()
export class RejectBookingUseCase {
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
      'rejected',
      'booking.rejected',
      { reason },
    );
  }
}
