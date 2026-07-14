import { createZodDto } from 'nestjs-zod';
import {
  autoCampaignInputSchema,
  autoCampaignSchema,
  createPartnerPromotionInputSchema,
  createPromotionInputSchema,
  promoUsageStatsResponseSchema,
  promotionResponseSchema,
  updatePartnerPromotionInputSchema,
  updatePromotionInputSchema,
  validatePromoInputSchema,
  validatePromoResponseSchema,
} from '@booking/contracts';

// Request bodies
export class CreatePromotionDto extends createZodDto(createPromotionInputSchema) {}
export class UpdatePromotionDto extends createZodDto(updatePromotionInputSchema) {}
export class CreatePartnerPromotionDto extends createZodDto(createPartnerPromotionInputSchema) {}
export class UpdatePartnerPromotionDto extends createZodDto(updatePartnerPromotionInputSchema) {}
export class ValidatePromoDto extends createZodDto(validatePromoInputSchema) {}
export class AutoCampaignDto extends createZodDto(autoCampaignInputSchema) {}

// Responses
export class ValidatePromoResponseDto extends createZodDto(validatePromoResponseSchema) {}
export class AutoCampaignResponseDto extends createZodDto(autoCampaignSchema) {}
export class PromotionResponseDto extends createZodDto(promotionResponseSchema) {}
export class PromoUsageStatsResponseDto extends createZodDto(promoUsageStatsResponseSchema) {}
