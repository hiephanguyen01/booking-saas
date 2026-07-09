import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
  type PartnerBookingStat,
} from '../../domain/ports/booking-repository.port';

/** Per-partner cancel / no-show rates for the tenant dashboard (Task 1.13, §7.3). */
@Injectable()
export class PartnerBookingStatsUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<PartnerBookingStat[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.bookings.partnerBookingStats(tx));
  }
}
