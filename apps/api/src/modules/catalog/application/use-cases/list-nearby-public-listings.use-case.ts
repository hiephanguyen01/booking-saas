import { Injectable } from '@nestjs/common';
import type {
  NearbyPublicListingsInput,
  NearbyPublicListingsResponse,
  PublicCatalogSearchQuery,
} from '@booking/contracts';
import { SearchPublicCatalogUseCase } from './search-public-catalog.use-case';

const NEARBY_LIMIT = 10;

@Injectable()
export class ListNearbyPublicListingsUseCase {
  constructor(private readonly searchCatalog: SearchPublicCatalogUseCase) {}

  async execute(
    host: string,
    input: NearbyPublicListingsInput,
  ): Promise<NearbyPublicListingsResponse> {
    const query: PublicCatalogSearchQuery = {
      type: input.type,
      partner: undefined,
      mode: undefined,
      q: '',
      location: [],
      amenities: [],
      guests: 1,
      quantity: 1,
      date: undefined,
      startTime: undefined,
      endTime: undefined,
      from: undefined,
      to: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minRating: undefined,
      sort: 'relevance',
      page: 1,
      pageSize: 48,
      attributes: {},
      attributeRanges: {},
    };
    const result = await this.searchCatalog.execute(host, query, {
      latitude: input.latitude,
      longitude: input.longitude,
      limit: NEARBY_LIMIT,
    });

    return {
      items: result.items.flatMap((item) =>
        item.distanceMeters === undefined
          ? []
          : [
              {
                id: item.id,
                kind: item.kind,
                title: item.title,
                slug: item.slug,
                listingTypeSlug: item.listingTypeSlug,
                photos: item.photos,
                priceFrom: item.priceFrom,
                regularPriceFrom: item.regularPriceFrom,
                priceUnit: item.priceUnit,
                completedBookings: item.completedBookings,
                ratingAvg: item.ratingAvg,
                reviewCount: item.reviewCount,
                address: item.address,
                provinceCode: item.provinceCode,
                provinceName: item.provinceName,
                wardCode: item.wardCode,
                wardName: item.wardName,
                distanceMeters: item.distanceMeters,
              },
            ],
      ),
    };
  }
}
