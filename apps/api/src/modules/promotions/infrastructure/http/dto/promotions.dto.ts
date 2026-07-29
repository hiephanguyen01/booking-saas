import { createZodDto } from 'nestjs-zod';
import {
  autoCampaignInputSchema,
  autoCampaignSchema,
  createPartnerPromotionInputSchema,
  createPromotionInputSchema,
  listPartnerPromotionsQuerySchema,
  listPromotionsQuerySchema,
  promoUsageStatsResponseSchema,
  promotionCategoryOptionSchema,
  promotionDetailResponseSchema,
  promotionResponseSchema,
  storefrontPromotionSchema,
  storefrontPromotionsInputSchema,
  updatePartnerPromotionInputSchema,
  updatePromotionInputSchema,
  validatePromoInputSchema,
  validatePromoResponseSchema,
} from '@booking/contracts';

// Query params
export class ListPromotionsQueryDto extends createZodDto(listPromotionsQuerySchema) {}
export class ListPartnerPromotionsQueryDto extends createZodDto(listPartnerPromotionsQuerySchema) {}

// Request bodies
export class CreatePromotionDto extends createZodDto(createPromotionInputSchema) {}
export class UpdatePromotionDto extends createZodDto(updatePromotionInputSchema) {}
export class CreatePartnerPromotionDto extends createZodDto(createPartnerPromotionInputSchema) {}
export class UpdatePartnerPromotionDto extends createZodDto(updatePartnerPromotionInputSchema) {}
export class ValidatePromoDto extends createZodDto(validatePromoInputSchema) {}
export class StorefrontPromotionsDto extends createZodDto(storefrontPromotionsInputSchema) {}
export class AutoCampaignDto extends createZodDto(autoCampaignInputSchema) {}

// Responses
export class ValidatePromoResponseDto extends createZodDto(validatePromoResponseSchema) {}
export class StorefrontPromotionDto extends createZodDto(storefrontPromotionSchema) {}
export class AutoCampaignResponseDto extends createZodDto(autoCampaignSchema) {}
export class PromotionResponseDto extends createZodDto(promotionResponseSchema) {}
export class PromotionDetailResponseDto extends createZodDto(promotionDetailResponseSchema) {}
export class PromotionCategoryOptionDto extends createZodDto(promotionCategoryOptionSchema) {}
export class PromoUsageStatsResponseDto extends createZodDto(promoUsageStatsResponseSchema) {}
