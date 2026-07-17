import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';

/** One page of a tenant's (or one partner's) listing groups — offset-paginated. */
@Injectable()
export class ListListingGroupsUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    filter: { partnerId?: string },
    page: { page: number; pageSize: number },
  ): Promise<{ items: ListingGroupRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.repo.listPage(tx, filter, page));
  }
}
