import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
  type TenantBookingFilters,
} from '../../domain/ports/booking-repository.port';

/** Tenant-side booking overview (Task 1.13). RLS-scoped via `forTenant`. */
@Injectable()
export class ListTenantBookingsUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, filters: TenantBookingFilters): Promise<BookingRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.bookings.listByTenant(tx, filters));
  }
}
