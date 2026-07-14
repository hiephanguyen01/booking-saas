import { createZodDto } from 'nestjs-zod';
import {
  createListingTypeInputSchema,
  listPublicListingsQuerySchema,
  listingTypeResponseSchema,
  publicListingResponseSchema,
  publicListingTypeResponseSchema,
  updateListingTypeInputSchema,
} from '@booking/contracts';

// Request bodies
export class CreateListingTypeDto extends createZodDto(createListingTypeInputSchema) {}
export class UpdateListingTypeDto extends createZodDto(updateListingTypeInputSchema) {}

// Query params
export class ListPublicListingsQueryDto extends createZodDto(listPublicListingsQuerySchema) {}

// Responses
export class ListingTypeResponseDto extends createZodDto(listingTypeResponseSchema) {}
export class PublicListingTypeResponseDto extends createZodDto(publicListingTypeResponseSchema) {}
export class PublicListingResponseDto extends createZodDto(publicListingResponseSchema) {}
