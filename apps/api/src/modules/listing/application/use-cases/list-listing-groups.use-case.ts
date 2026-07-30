import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { PublishStatus } from '@booking/contracts';
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
    filter: { partnerId?: string; listingTypeId?: string; status?: PublishStatus; q?: string },
    page: { page: number; pageSize: number },
  ): Promise<RepoPage<ListingGroupRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.repo.listPage(tx, filter, page));
  }
}
