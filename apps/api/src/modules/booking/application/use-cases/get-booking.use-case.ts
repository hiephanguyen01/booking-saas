import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
  type BookingRecord,
} from '../../domain/ports/booking-repository.port';

/**
 * Fetch a single booking for a dashboard detail view (Task 1.13/1.14). Tenant
 * scope loads any of its bookings; partner scope must additionally own it
 * (`partnerId`) — a mismatch resolves to 404 so a partner can't probe other
 * partners' bookings by id.
 */
@Injectable()
export class GetBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string, opts: { partnerId?: string } = {}): Promise<BookingRecord> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) => this.bookings.findById(tx, id));
    if (!booking || (opts.partnerId && booking.partnerId !== opts.partnerId)) {
      throw new BookingNotFound();
    }
    return booking;
  }
}
