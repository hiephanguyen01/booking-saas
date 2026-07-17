import { Inject, Injectable } from '@nestjs/common';
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

/** List a resource's date-specific availability exceptions (next 180 days) — §7.4/§9. */
@Injectable()
export class ListAvailabilityExceptionsUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(AVAILABILITY_EXCEPTION_REPOSITORY)
    private readonly exceptions: IAvailabilityExceptionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(ctx: ManageContext, resourceId: string): Promise<AvailabilityExceptionRecord[]> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertResource(this.resources, tx, resourceId, ctx.partnerId);
      const today = utcNow().toISOString().slice(0, 10);
      const to = addDays(utcNow(), 180).toISOString().slice(0, 10);
      return this.exceptions.listByResource(tx, resourceId, today, to);
    });
  }
}
