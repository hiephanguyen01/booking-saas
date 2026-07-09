import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { AvailabilityCache } from '../infrastructure/availability-cache';

/**
 * Invalidates the resource-scoped availability cache when the booking-derived
 * busy set changes. Booking outbox events carry only a `bookingId`, so the
 * booking's `resource_id` is resolved in-tenant before invalidating (availability
 * is resource-scoped → one booking change invalidates every listing on the
 * resource). In-module block/rule edits call {@link invalidateResource} directly.
 */
@Injectable()
export class AvailabilityCacheInvalidator {
  constructor(
    private readonly cache: AvailabilityCache,
    private readonly tenantDb: TenantDbService,
  ) {}

  invalidateResource(resourceId: string): Promise<void> {
    return this.cache.invalidateResource(resourceId);
  }

  async invalidateByBooking(tenantId: string, bookingId: string): Promise<void> {
    const resourceId = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<{ resource_id: string }[]>`
        SELECT resource_id FROM bookings WHERE id = ${bookingId}::uuid`;
      return rows[0]?.resource_id ?? null;
    });
    if (resourceId) await this.cache.invalidateResource(resourceId);
  }
}
