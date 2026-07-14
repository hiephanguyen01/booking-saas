import { createZodDto } from 'nestjs-zod';
import {
  createPromotionInputSchema,
  promoUsageStatsResponseSchema,
  promotionResponseSchema,
  updatePromotionInputSchema,
  validatePromoInputSchema,
  validatePromoResponseSchema,
} from '@booking/shared';

// Request bodies
export class CreatePromotionDto extends createZodDto(createPromotionInputSchema) {}
export class UpdatePromotionDto extends createZodDto(updatePromotionInputSchema) {}
export class ValidatePromoDto extends createZodDto(validatePromoInputSchema) {}

// Responses
export class ValidatePromoResponseDto extends createZodDto(validatePromoResponseSchema) {}
export class PromotionResponseDto extends createZodDto(promotionResponseSchema) {}
export class PromoUsageStatsResponseDto extends createZodDto(promoUsageStatsResponseSchema) {}
