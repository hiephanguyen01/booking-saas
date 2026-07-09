import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
  type PartnerCalendarBooking,
} from '../../domain/ports/booking-repository.port';

export interface PartnerCalendarQuery {
  tenantId: string;
  partnerId: string;
  from: Date;
  to: Date;
}

/**
 * Master-calendar feed (Task 1.14, §21 item 8): every booking across all of the
 * partner's resources whose slot overlaps the requested window, with the listing
 * context the calendar needs to render + filter by listing type.
 */
@Injectable()
export class PartnerCalendarUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(query: PartnerCalendarQuery): Promise<PartnerCalendarBooking[]> {
    return this.tenantDb.forTenant(query.tenantId, (tx) =>
      this.bookings.listForPartnerCalendar(tx, query.partnerId, query.from, query.to),
    );
  }
}
