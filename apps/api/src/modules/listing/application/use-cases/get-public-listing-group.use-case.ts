import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import { basePrices } from '../../domain/group-stats';

function listingPriceFrom(listing: ListingRecord): string | null {
  const prices = basePrices(listing);
  return prices.length
    ? prices.reduce((left, right) => (right < left ? right : left)).toString()
    : null;
}

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
      const partner = group.partnerPublic;
      if (partner.status !== 'approved') return null;
      return {
        id: group.id,
        title: group.title,
        slug: group.slug,
        description: group.description,
        provinceCode: group.provinceCode,
        provinceName: group.provinceName,
        wardCode: group.wardCode,
        wardName: group.wardName,
        address: group.address,
        workingArea: group.workingArea,
        amenities: group.amenities,
        photos: group.photos,
        listingTypeSlug: listingType?.slug ?? '',
        bookingSelection: listingType?.bookingSelection ?? 'flexible_duration',
        itemLabel: listingType?.itemLabel?.trim() || 'hạng mục',
        ratingAvg: group.ratingAvg,
        reviewCount: group.reviewCount,
        trust: {
          identityVerified: partner.verifiedAt !== null,
          partnerActiveSince: partner.createdAt.toISOString(),
          partnerName: partner.name,
          partnerSlug: partner.slug,
          partnerLogoUrl: partner.logoUrl,
          completedBookings: group.bookingCount,
          avgApprovalResponseSeconds: null,
        },
        listings: children
          .filter((listing) => listing.status === 'published')
          .map((listing) => ({
            id: listing.id,
            title: listing.title,
            slug: listing.slug,
            description: listing.description,
            photos: listing.photos,
            attributes: listing.attributes,
            bookingModes: listing.bookingModes,
            priceFrom: listingPriceFrom(listing),
            ratingAvg: listing.ratingAvg,
            reviewCount: listing.reviewCount,
          })),
      } satisfies PublicListingGroupDetailResponse;
    });
    if (!result)
      throw new NotFoundException({
        statusCode: 404,
        code: 'LISTING_GROUP_NOT_FOUND',
        message: 'Listing group not found',
      });
    return result;
  }
}
