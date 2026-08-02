import { Inject, Injectable } from '@nestjs/common';
import type { PublicListingGroupDetailResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
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
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';
import { toPublicListingGroupDetailResponse } from '../listing.mapper';

@Injectable()
export class GetPublicListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string): Promise<PublicListingGroupDetailResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const result = await this.tenantDb.forTenant(tenant.id, async (tx) => {
      const group = await this.groups.findBySlug(tx, slug);
      if (!group || group.status !== 'published') return null;
      const [children, listingType] = await Promise.all([
        this.listings.list(tx, { groupId: group.id, partnerId: group.partnerId }),
        this.listingTypes.findById(tx, group.listingTypeId),
      ]);
      if (group.partnerPublic.status !== 'approved') return null;
      return toPublicListingGroupDetailResponse(group, children, listingType);
    });
    if (!result) throw new ListingGroupNotFound();
    return result;
  }
}
