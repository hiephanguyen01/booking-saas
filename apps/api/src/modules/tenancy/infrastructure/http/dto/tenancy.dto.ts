import { createZodDto } from 'nestjs-zod';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  createPlanInputSchema,
  createTenantInputSchema,
  createdTenantResponseSchema,
  currentSubscriptionResponseSchema,
  domainDnsCheckResponseSchema,
  domainResponseSchema,
  domainVerificationResultSchema,
  listTenantsQuerySchema,
  paginationQuerySchema,
  partnerPromotionsToggleSchema,
  planResponseSchema,
  platformHealthResponseSchema,
  publicTenantResponseSchema,
  setDefaultCancellationPolicyInputSchema,
  slugAvailabilityResponseSchema,
  slugCheckQuerySchema,
  subscriptionHistoryItemSchema,
  subscriptionResponseSchema,
  subscriptionStatusResponseSchema,
  tenancyConfigResponseSchema,
  tenantDetailResponseSchema,
  tenantResponseSchema,
  tenantThemeResponseSchema,
  updatePlanInputSchema,
  updateThemeInputSchema,
  updateTenantInputSchema,
} from '@booking/contracts';

// ── Request bodies / queries ─────────────────────────────────────────────────
export class CreatePlanDto extends createZodDto(createPlanInputSchema) {}
export class UpdatePlanDto extends createZodDto(updatePlanInputSchema) {}
export class CreateTenantDto extends createZodDto(createTenantInputSchema) {}
export class UpdateTenantDto extends createZodDto(updateTenantInputSchema) {}
export class SetDefaultCancellationPolicyDto extends createZodDto(
  setDefaultCancellationPolicyInputSchema,
) {}
export class AssignSubscriptionDto extends createZodDto(assignSubscriptionInputSchema) {}
export class AddDomainDto extends createZodDto(addDomainInputSchema) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
export class ListTenantsQueryDto extends createZodDto(listTenantsQuerySchema) {}

/** `GET /admin/tenants/slug-check?slug=…` — validated with the same slug rule create enforces. */
export class SlugCheckQueryDto extends createZodDto(slugCheckQuerySchema) {}

export class UpdateThemeDto extends createZodDto(updateThemeInputSchema) {}
export class PartnerPromotionsToggleDto extends createZodDto(partnerPromotionsToggleSchema) {}

// ── Responses ────────────────────────────────────────────────────────────────
export class PlanResponseDto extends createZodDto(planResponseSchema) {}
export class TenantResponseDto extends createZodDto(tenantResponseSchema) {}
export class TenantDetailResponseDto extends createZodDto(tenantDetailResponseSchema) {}
export class SubscriptionResponseDto extends createZodDto(subscriptionResponseSchema) {}
export class SubscriptionHistoryItemDto extends createZodDto(subscriptionHistoryItemSchema) {}
export class TenancyConfigResponseDto extends createZodDto(tenancyConfigResponseSchema) {}
export class SlugAvailabilityResponseDto extends createZodDto(slugAvailabilityResponseSchema) {}
export class DomainResponseDto extends createZodDto(domainResponseSchema) {}
export class DomainVerificationResultDto extends createZodDto(domainVerificationResultSchema) {}
export class DomainDnsCheckResponseDto extends createZodDto(domainDnsCheckResponseSchema) {}
export class SubscriptionStatusResponseDto extends createZodDto(subscriptionStatusResponseSchema) {}
export class PublicTenantResponseDto extends createZodDto(publicTenantResponseSchema) {}
export class PlatformHealthResponseDto extends createZodDto(platformHealthResponseSchema) {}

/** Newly created tenant plus its auto-provisioned primary domain (POST /admin/tenants). */
export class CreatedTenantDto extends createZodDto(createdTenantResponseSchema) {}

/** A tenant's selected current subscription and resolved plan. */
export class CurrentSubscriptionDto extends createZodDto(currentSubscriptionResponseSchema) {}

export class TenantThemeResponseDto extends createZodDto(tenantThemeResponseSchema) {}
