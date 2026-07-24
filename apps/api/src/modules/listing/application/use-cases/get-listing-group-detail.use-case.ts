import { Inject, Injectable } from '@nestjs/common';
import type { ListingGroupDetailResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../../catalog/domain/ports/listing-type-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';
import { toListingGroupResponse, toListingResponse } from '../listing.mapper';
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';

@Injectable()
export class GetListingGroupDetailUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    id: string,
    requirePartnerId?: string,
  ): Promise<ListingGroupDetailResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const group = await this.groups.findById(tx, id);
      if (!group || (requirePartnerId && group.partnerId !== requirePartnerId)) {
        throw new ListingGroupNotFound();
      }
      const [children, type] = await Promise.all([
        this.listings.list(tx, { groupId: group.id, partnerId: requirePartnerId }),
        this.listingTypes.findById(tx, group.listingTypeId),
      ]);
      // listingCount / readyListingCount / priceFrom come from the base mapper —
      // one definition of "ready", shared with the group list (§7.3).
      return {
        ...toListingGroupResponse(group),
        listings: children.map(toListingResponse),
        itemLabel: type?.itemLabel?.trim() || 'hạng mục',
      };
    });
  }
}
