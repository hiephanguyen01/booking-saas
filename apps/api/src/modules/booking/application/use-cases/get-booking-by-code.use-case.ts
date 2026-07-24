import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';

/** Fetch a booking by code with no auth check (dev/mock-pay path only). */
@Injectable()
export class GetBookingByCodeUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, code: string): Promise<BookingRecord> {
    const booking = await this.tenantDb.forTenant(tenantId, (tx) => this.bookings.findByCode(tx, code));
    if (!booking) throw new BookingNotFound();
    return booking;
  }
}
