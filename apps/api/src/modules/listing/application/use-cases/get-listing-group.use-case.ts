import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import {
  ListingGroupNotFound,
  ListingGroupNotOwnedForManage,
} from '../../domain/errors/listing-group-errors';

@Injectable()
export class GetListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    options: { requirePartnerId?: string } = {},
  ): Promise<ListingGroupRecord> {
    const group = await this.tenantDb.forTenant(tenantId, (tx) => this.repo.findById(tx, id));
    if (!group) {
      throw new ListingGroupNotFound();
    }
    if (options.requirePartnerId && group.partnerId !== options.requirePartnerId) {
      throw new ListingGroupNotOwnedForManage();
    }
    return group;
  }
}
