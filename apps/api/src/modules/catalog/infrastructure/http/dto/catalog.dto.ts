import { createZodDto } from 'nestjs-zod';
import {
  createListingTypeInputSchema,
  publicCatalogSearchQuerySchema,
  publicCatalogSearchResponseSchema,
  listingTypeResponseSchema,
  publicListingTypeResponseSchema,
  updateListingTypeInputSchema,
} from '@booking/contracts';

// Request bodies
export class CreateListingTypeDto extends createZodDto(createListingTypeInputSchema) {}
export class UpdateListingTypeDto extends createZodDto(updateListingTypeInputSchema) {}

// Query params
export class ListPublicListingsQueryDto extends createZodDto(publicCatalogSearchQuerySchema) {}

// Responses
export class ListingTypeResponseDto extends createZodDto(listingTypeResponseSchema) {}
export class PublicListingTypeResponseDto extends createZodDto(publicListingTypeResponseSchema) {}
export class PublicListingResponseDto extends createZodDto(publicCatalogSearchResponseSchema) {}
