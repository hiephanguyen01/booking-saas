import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

/** Delete a resource's date-specific availability exception — §7.4/§9. */
@Injectable()
export class DeleteAvailabilityExceptionUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(AVAILABILITY_EXCEPTION_REPOSITORY)
    private readonly exceptions: IAvailabilityExceptionRepository,
    private readonly tenantDb: TenantDbService,
    @Inject(AVAILABILITY_CACHE) private readonly cache: IAvailabilityCache,
  ) {}

  async execute(ctx: ManageContext, resourceId: string, exceptionId: string): Promise<void> {
    await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertResource(this.resources, tx, resourceId, ctx.partnerId);
      const existing = await this.exceptions.findById(tx, exceptionId);
      if (!existing || existing.resourceId !== resourceId) {
        throw new NotFoundException({ statusCode: 404, code: 'EXCEPTION_NOT_FOUND', message: 'Exception not found' });
      }
      await this.exceptions.delete(tx, exceptionId);
    });
    // Open windows changed → the cached slots for this resource are stale (§9.1).
    await this.cache.invalidateResource(resourceId);
  }
}
