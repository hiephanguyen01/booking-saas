import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import { toListingGroupResponse, toListingResponse } from '../listing.mapper';

function basePrice(listing: ListingRecord): number[] {
  return Object.values(listing.modeConfig).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const config = value as Record<string, unknown>;
    return ['basePrice', 'basePricePerNight']
      .map((key) => Number(config[key]))
      .filter((price) => Number.isFinite(price) && price > 0);
  });
}

function isReady(listing: ListingRecord): boolean {
  return (
    Boolean(listing.description?.trim()) &&
    listing.photos.length > 0 &&
    basePrice(listing).length >= listing.bookingModes.length
  );
}

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
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_GROUP_NOT_FOUND',
          message: 'Listing group not found',
        });
      }
      const [children, type] = await Promise.all([
        this.listings.list(tx, { groupId: group.id, partnerId: requirePartnerId }),
        this.listingTypes.findById(tx, group.listingTypeId),
      ]);
      const prices = children.flatMap(basePrice);
      return {
        ...toListingGroupResponse(group),
        listings: children.map(toListingResponse),
        listingCount: children.length,
        readyListingCount: children.filter(isReady).length,
        priceFrom: prices.length ? String(Math.min(...prices)) : null,
        itemLabel: type?.itemLabel?.trim() || 'hạng mục',
      };
    });
  }
}
