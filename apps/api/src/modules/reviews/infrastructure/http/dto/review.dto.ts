import { createZodDto } from 'nestjs-zod';
import {
  adminReviewListResponseSchema,
  adminReviewsQuerySchema,
  createReviewInputSchema,
  customerReviewListResponseSchema,
  customerReviewsQuerySchema,
  partnerReviewsQuerySchema,
  publicReviewsQuerySchema,
  reviewMediaPresignInputSchema,
  replyReviewInputSchema,
  reviewListResponseSchema,
  reviewResponseSchema,
  tenantReviewsQuerySchema,
} from '@booking/contracts';

export class CreateReviewDto extends createZodDto(createReviewInputSchema) {}
export class ReviewMediaPresignDto extends createZodDto(reviewMediaPresignInputSchema) {}
export class ReplyReviewDto extends createZodDto(replyReviewInputSchema) {}
export class PublicReviewsQueryDto extends createZodDto(publicReviewsQuerySchema) {}
export class CustomerReviewsQueryDto extends createZodDto(customerReviewsQuerySchema) {}
export class PartnerReviewsQueryDto extends createZodDto(partnerReviewsQuerySchema) {}
export class TenantReviewsQueryDto extends createZodDto(tenantReviewsQuerySchema) {}
export class AdminReviewsQueryDto extends createZodDto(adminReviewsQuerySchema) {}
export class ReviewResponseDto extends createZodDto(reviewResponseSchema) {}
export class ReviewListResponseDto extends createZodDto(reviewListResponseSchema) {}
export class CustomerReviewListResponseDto extends createZodDto(customerReviewListResponseSchema) {}
export class AdminReviewListResponseDto extends createZodDto(adminReviewListResponseSchema) {}
