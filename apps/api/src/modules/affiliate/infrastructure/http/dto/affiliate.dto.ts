import { createZodDto } from 'nestjs-zod';
import {
  affiliateCommissionResponseSchema,
  affiliateDetailResponseSchema,
  affiliateListItemSchema,
  affiliateRateResponseSchema,
  affiliateResponseSchema,
  affiliateStatsResponseSchema,
  affiliateStatusResponseSchema,
  applyAffiliateInputSchema,
  createReferralLinkInputSchema,
  listAffiliateCommissionsQuerySchema,
  listAffiliateLinksQuerySchema,
  listAffiliatesQuerySchema,
  referralLinkResponseSchema,
  tenantAffiliateStatusInputSchema,
  tenantUpdateAffiliateInputSchema,
  trackReferralInputSchema,
  trackReferralResponseSchema,
  updateAffiliatePayoutInfoInputSchema,
} from '@booking/contracts';

// Query params
export class ListAffiliatesQueryDto extends createZodDto(listAffiliatesQuerySchema) {}
export class ListAffiliateCommissionsQueryDto extends createZodDto(listAffiliateCommissionsQuerySchema) {}
export class ListAffiliateLinksQueryDto extends createZodDto(listAffiliateLinksQuerySchema) {}

// Request bodies
export class ApplyAffiliateDto extends createZodDto(applyAffiliateInputSchema) {}
export class UpdateAffiliatePayoutInfoDto extends createZodDto(updateAffiliatePayoutInfoInputSchema) {}
export class CreateReferralLinkDto extends createZodDto(createReferralLinkInputSchema) {}
export class TrackReferralDto extends createZodDto(trackReferralInputSchema) {}
export class TenantAffiliateStatusDto extends createZodDto(tenantAffiliateStatusInputSchema) {}
export class TenantUpdateAffiliateDto extends createZodDto(tenantUpdateAffiliateInputSchema) {}

// Responses
export class AffiliateResponseDto extends createZodDto(affiliateResponseSchema) {}
export class AffiliateListItemDto extends createZodDto(affiliateListItemSchema) {}
export class AffiliateDetailResponseDto extends createZodDto(affiliateDetailResponseSchema) {}
export class ReferralLinkResponseDto extends createZodDto(referralLinkResponseSchema) {}
export class AffiliateStatsResponseDto extends createZodDto(affiliateStatsResponseSchema) {}
export class AffiliateCommissionResponseDto extends createZodDto(affiliateCommissionResponseSchema) {}
export class AffiliateStatusResponseDto extends createZodDto(affiliateStatusResponseSchema) {}
export class AffiliateRateResponseDto extends createZodDto(affiliateRateResponseSchema) {}
export class TrackReferralResponseDto extends createZodDto(trackReferralResponseSchema) {}
