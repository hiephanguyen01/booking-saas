import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityExceptionRangeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
} from '../../../listing/domain/ports/resource-repository.port';
import {
  AVAILABILITY_EXCEPTION_REPOSITORY,
  type AvailabilityExceptionRecord,
  type IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import {
  AVAILABILITY_CACHE,
  type IAvailabilityCache,
} from '../../domain/ports/availability-cache.port';
import { eachDate } from '../../../../shared/domain/availability/date-util';
import { ResourceCalendar } from '../../domain/entities/resource-calendar.entity';
import { assertResource, type ManageContext } from '../availability-support';

/**
 * Apply one exception to every date in a span — the calendar's range action.
 *
 * The whole span commits in ONE transaction, so a partner closing a two-week
 * holiday never leaves the calendar half-closed. Cache invalidation likewise
 * runs once at the end rather than per date: the cache is keyed by resource, so
 * N invalidations would repeat identical work and each intermediate one could
 * repopulate stale slots from the not-yet-committed remainder of the span.
 *
 * Per-date upsert semantics are inherited from the single-date path: re-running
 * the same range overwrites, so it is idempotent.
 */
@Injectable()
export class AddAvailabilityExceptionRangeUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(AVAILABILITY_EXCEPTION_REPOSITORY)
    private readonly exceptions: IAvailabilityExceptionRepository,
    private readonly tenantDb: TenantDbService,
    @Inject(AVAILABILITY_CACHE) private readonly cache: IAvailabilityCache,
  ) {}

  async execute(
    ctx: ManageContext,
    resourceId: string,
    data: AvailabilityExceptionRangeInput,
  ): Promise<AvailabilityExceptionRecord[]> {
    const created = await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertResource(this.resources, tx, resourceId, ctx.partnerId);
      const calendar = ResourceCalendar.forResource(resourceId);
      const rows: AvailabilityExceptionRecord[] = [];
      for (const date of eachDate(data.from, data.to)) {
        const input = calendar.newException({
          date,
          type: data.type,
          ...(data.openTime ? { openTime: data.openTime } : {}),
          ...(data.closeTime ? { closeTime: data.closeTime } : {}),
          ...(data.reason ? { reason: data.reason } : {}),
        });
        rows.push(await this.exceptions.create(tx, ctx.tenantId, resourceId, input));
      }
      return rows;
    });
    // Open windows changed → the cached slots for this resource are stale (§9.1).
    await this.cache.invalidateResource(resourceId);
    return created;
  }
}
