import { createZodDto } from 'nestjs-zod';
import {
  cancellationPolicyResponseSchema,
  createCancellationPolicyInputSchema,
  createListingGroupInputSchema,
  createListingInputSchema,
  createResourceInputSchema,
  listingGroupResponseSchema,
  listingGroupDetailResponseSchema,
  listingGroupReviewResponseSchema,
  listingResponseSchema,
  listingReviewResponseSchema,
  listListingGroupsQuerySchema,
  listPartnerListingsQuerySchema,
  listTenantListingsQuerySchema,
  moderationReasonInputSchema,
  pricingRuleInputSchema,
  pricingRuleResponseSchema,
  publicListingDetailWithTimezoneResponseSchema,
  publicListingGroupDetailResponseSchema,
  publishListingInputSchema,
  quoteQuerySchema,
  quoteResponseSchema,
  resourceResponseSchema,
  submitListingResponseSchema,
  updateCancellationPolicyInputSchema,
  updateListingGroupInputSchema,
  updateListingInputSchema,
  depositRequirementResponseSchema,
} from '@booking/contracts';

// ── Request bodies / query ────────────────────────────────────────────────────
export class CreateListingGroupDto extends createZodDto(createListingGroupInputSchema) {}
export class UpdateListingGroupDto extends createZodDto(updateListingGroupInputSchema) {}
export class CreateListingDto extends createZodDto(createListingInputSchema) {}
export class UpdateListingDto extends createZodDto(updateListingInputSchema) {}
export class CreateResourceDto extends createZodDto(createResourceInputSchema) {}
export class PricingRuleDto extends createZodDto(pricingRuleInputSchema) {}
export class QuoteQueryDto extends createZodDto(quoteQuerySchema) {}
export class ModerationReasonDto extends createZodDto(moderationReasonInputSchema) {}
export class PublishListingDto extends createZodDto(publishListingInputSchema) {}
export class ListTenantListingsQueryDto extends createZodDto(listTenantListingsQuerySchema) {}
export class ListPartnerListingsQueryDto extends createZodDto(listPartnerListingsQuerySchema) {}
export class ListListingGroupsQueryDto extends createZodDto(listListingGroupsQuerySchema) {}
export class CreateCancellationPolicyDto extends createZodDto(
  createCancellationPolicyInputSchema,
) {}
export class UpdateCancellationPolicyDto extends createZodDto(
  updateCancellationPolicyInputSchema,
) {}

// ── Responses ─────────────────────────────────────────────────────────────────
export class ListingGroupResponseDto extends createZodDto(listingGroupResponseSchema) {}
export class ListingGroupDetailResponseDto extends createZodDto(listingGroupDetailResponseSchema) {}
export class ListingResponseDto extends createZodDto(listingResponseSchema) {}
export class ResourceResponseDto extends createZodDto(resourceResponseSchema) {}
export class PricingRuleResponseDto extends createZodDto(pricingRuleResponseSchema) {}
export class PublicListingDetailResponseDto extends createZodDto(
  publicListingDetailWithTimezoneResponseSchema,
) {}
export class PublicListingGroupDetailResponseDto extends createZodDto(
  publicListingGroupDetailResponseSchema,
) {}
export class QuoteResponseDto extends createZodDto(quoteResponseSchema) {}
export class ListingReviewResponseDto extends createZodDto(listingReviewResponseSchema) {}
export class ListingGroupReviewResponseDto extends createZodDto(listingGroupReviewResponseSchema) {}
export class CancellationPolicyResponseDto extends createZodDto(cancellationPolicyResponseSchema) {}
export class DepositRequirementResponseDto extends createZodDto(depositRequirementResponseSchema) {}

// ── Composed responses ────────────────────────────────────────────────────────
/** Partner submit-for-review returns the listing plus its review checklist. */
export class SubmitListingResponseDto extends createZodDto(submitListingResponseSchema) {}
