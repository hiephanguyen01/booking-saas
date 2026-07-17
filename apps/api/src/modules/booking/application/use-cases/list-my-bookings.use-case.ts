import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';

/** The logged-in customer's booking list for this tenant (§8.6). */
@Injectable()
export class ListMyBookingsUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, customerId: string): Promise<BookingRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.bookings.listByCustomer(tx, customerId));
  }
}
