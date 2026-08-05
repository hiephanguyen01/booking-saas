import { createZodDto } from 'nestjs-zod';
import {
  createListingTypeInputSchema,
  listListingTypesQuerySchema,
  publicCatalogSearchQuerySchema,
  publicCatalogSearchResponseSchema,
  listingTypeResponseSchema,
  publicListingTypeResponseSchema,
  updateListingTypeInputSchema,
  nearbyPublicListingsInputSchema,
  nearbyPublicListingsResponseSchema,
} from '@booking/contracts';

// Request bodies
export class CreateListingTypeDto extends createZodDto(createListingTypeInputSchema) {}
export class UpdateListingTypeDto extends createZodDto(updateListingTypeInputSchema) {}
export class NearbyPublicListingsInputDto extends createZodDto(nearbyPublicListingsInputSchema) {}

// Query params
export class ListListingTypesQueryDto extends createZodDto(listListingTypesQuerySchema) {}
export class ListPublicListingsQueryDto extends createZodDto(publicCatalogSearchQuerySchema) {}

// Responses
export class ListingTypeResponseDto extends createZodDto(listingTypeResponseSchema) {}
export class PublicListingTypeResponseDto extends createZodDto(publicListingTypeResponseSchema) {}
export class PublicListingResponseDto extends createZodDto(publicCatalogSearchResponseSchema) {}
export class NearbyPublicListingsResponseDto extends createZodDto(
  nearbyPublicListingsResponseSchema,
) {}
