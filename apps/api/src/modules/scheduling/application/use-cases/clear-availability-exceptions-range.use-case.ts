import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
} from '../../../listing/domain/ports/resource-repository.port';
import {
  AVAILABILITY_EXCEPTION_REPOSITORY,
  type IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import {
  AVAILABILITY_CACHE,
  type IAvailabilityCache,
} from '../../domain/ports/availability-cache.port';
import { assertResource, type ManageContext } from '../availability-support';

/**
 * Drop every date-specific override in a span, handing those dates back to the
 * weekly schedule.
 *
 * The counterpart of {@link AddAvailabilityExceptionRangeUseCase}: setting a
 * holiday across two weeks was one action, so undoing it must be one action too
 * — otherwise "use the weekly schedule again" stays a per-day chore. Deleting
 * nothing is success, not an error: the caller asked for a state, and the span
 * is already in it.
 */
@Injectable()
export class ClearAvailabilityExceptionsRangeUseCase {
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
    range: { from: string; to: string },
  ): Promise<{ cleared: number }> {
    const cleared = await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertResource(this.resources, tx, resourceId, ctx.partnerId);
      return this.exceptions.deleteInRange(tx, resourceId, range.from, range.to);
    });
    // Open windows changed → the cached slots for this resource are stale (§9.1).
    if (cleared > 0) await this.cache.invalidateResource(resourceId);
    return { cleared };
  }
}
