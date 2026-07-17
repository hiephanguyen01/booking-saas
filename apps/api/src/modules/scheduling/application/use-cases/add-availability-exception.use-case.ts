import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityExceptionInput } from '@booking/contracts';
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
import { assertResource, type ManageContext } from '../availability-support';

/** Add a date-specific availability exception to a resource — §7.4/§9. */
@Injectable()
export class AddAvailabilityExceptionUseCase {
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
    data: AvailabilityExceptionInput,
  ): Promise<AvailabilityExceptionRecord> {
    const created = await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertResource(this.resources, tx, resourceId, ctx.partnerId);
      return this.exceptions.create(tx, ctx.tenantId, resourceId, data);
    });
    // Open windows changed → the cached slots for this resource are stale (§9.1).
    await this.cache.invalidateResource(resourceId);
    return created;
  }
}
