import { createZodDto } from 'nestjs-zod';
import {
  customerFavoriteListResponseSchema,
  customerFavoritesQuerySchema,
  favoriteListResponseSchema,
  favoriteRefsResponseSchema,
  favoriteSummaryResponseSchema,
  favoriteToggleResponseSchema,
  partnerFavoritesQuerySchema,
  tenantFavoritesQuerySchema,
  toggleFavoriteInputSchema,
} from '@booking/contracts';

export class ToggleFavoriteDto extends createZodDto(toggleFavoriteInputSchema) {}
export class CustomerFavoritesQueryDto extends createZodDto(customerFavoritesQuerySchema) {}
export class PartnerFavoritesQueryDto extends createZodDto(partnerFavoritesQuerySchema) {}
export class TenantFavoritesQueryDto extends createZodDto(tenantFavoritesQuerySchema) {}
export class FavoriteToggleResponseDto extends createZodDto(favoriteToggleResponseSchema) {}
export class FavoriteRefsResponseDto extends createZodDto(favoriteRefsResponseSchema) {}
export class CustomerFavoriteListResponseDto extends createZodDto(
  customerFavoriteListResponseSchema,
) {}
export class FavoriteListResponseDto extends createZodDto(favoriteListResponseSchema) {}
export class FavoriteSummaryResponseDto extends createZodDto(favoriteSummaryResponseSchema) {}
