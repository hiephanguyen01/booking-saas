import { Inject, Injectable } from '@nestjs/common';
import type { BookingStatus } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
  type PartnerCalendarBooking,
} from '../../domain/ports/booking-repository.port';

export interface PartnerCalendarQuery {
  tenantId: string;
  partnerId: string;
  /** Case-insensitive search over the booking code + the customer's name / email. */
  q?: string;
  status?: BookingStatus;
  /** Timeslot-overlap window; both omitted → unbounded by date. */
  from?: Date;
  to?: Date;
}

/**
 * Master-calendar feed (Task 1.14, §21 item 8): every booking across all of the
 * partner's resources — optionally windowed by timeslot overlap and narrowed by
 * search / status — with the listing context the calendar needs to render + filter.
 */
@Injectable()
export class PartnerCalendarUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(query: PartnerCalendarQuery): Promise<PartnerCalendarBooking[]> {
    return this.tenantDb.forTenant(query.tenantId, (tx) =>
      this.bookings.listForPartnerCalendar(tx, query.partnerId, {
        q: query.q,
        status: query.status,
        from: query.from,
        to: query.to,
      }),
    );
  }
}
