import { Inject, Injectable } from '@nestjs/common';
import type { CalendarRangeQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { addDays, utcNow } from '../../../../shared/time/time';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
} from '../../../listing/domain/ports/resource-repository.port';
import {
  AVAILABILITY_EXCEPTION_REPOSITORY,
  type AvailabilityExceptionRecord,
  type IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import { assertResource, type ManageContext } from '../availability-support';

/** Window used when the caller does not name one (the operational near term). */
const DEFAULT_WINDOW_DAYS = 180;

/**
 * List a resource's date-specific availability exceptions — §7.4/§9.
 *
 * A caller that renders an arbitrary month (the partner calendar) must pass its
 * own `range`: the default window starts today, so without one a past month or
 * a month beyond {@link DEFAULT_WINDOW_DAYS} comes back empty and every stored
 * closure silently renders as "open".
 */
@Injectable()
export class ListAvailabilityExceptionsUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(AVAILABILITY_EXCEPTION_REPOSITORY)
    private readonly exceptions: IAvailabilityExceptionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    ctx: ManageContext,
    resourceId: string,
    range?: CalendarRangeQuery,
  ): Promise<AvailabilityExceptionRecord[]> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertResource(this.resources, tx, resourceId, ctx.partnerId);
      const from = range?.from ?? utcNow().toISOString().slice(0, 10);
      const to = range?.to ?? addDays(utcNow(), DEFAULT_WINDOW_DAYS).toISOString().slice(0, 10);
      return this.exceptions.listByResource(tx, resourceId, from, to);
    });
  }
}
