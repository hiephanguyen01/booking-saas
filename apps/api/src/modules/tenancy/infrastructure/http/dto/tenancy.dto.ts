import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  createPlanInputSchema,
  createTenantInputSchema,
  domainResponseSchema,
  domainVerificationResultSchema,
  listTenantsQuerySchema,
  paginationQuerySchema,
  partnerPromotionsToggleSchema,
  planResponseSchema,
  platformHealthResponseSchema,
  setDefaultCancellationPolicyInputSchema,
  slugAvailabilityResponseSchema,
  slugSchema,
  storefrontTenantResponseSchema,
  subscriptionHistoryItemSchema,
  subscriptionResponseSchema,
  subscriptionStatusResponseSchema,
  tenancyConfigResponseSchema,
  tenantDetailResponseSchema,
  tenantResponseSchema,
  tenantThemeResponseSchema,
  updatePlanInputSchema,
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
export class SlugCheckQueryDto extends createZodDto(z.object({ slug: slugSchema })) {}

/** Free-form storefront theme config body (§16.1). Stored as `tenants.theme_config`. */
const updateThemeInputSchema = z.object({ themeConfig: z.record(z.unknown()) });
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
export class SubscriptionStatusResponseDto extends createZodDto(subscriptionStatusResponseSchema) {}
export class StorefrontTenantResponseDto extends createZodDto(storefrontTenantResponseSchema) {}
export class PlatformHealthResponseDto extends createZodDto(platformHealthResponseSchema) {}

/** Newly created tenant plus its auto-provisioned primary domain (POST /admin/tenants). */
export class CreatedTenantDto extends createZodDto(
  tenantResponseSchema.extend({ primaryDomain: domainResponseSchema }),
) {}

/** A tenant's current subscription with its (possibly null) plan (GET /admin/tenants/:id/subscription). */
export class CurrentSubscriptionDto extends createZodDto(
  z.object({ subscription: subscriptionResponseSchema, plan: planResponseSchema.nullable() }),
) {}

export class TenantThemeResponseDto extends createZodDto(tenantThemeResponseSchema) {}
