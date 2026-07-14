import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  createPlanInputSchema,
  createTenantInputSchema,
  domainResponseSchema,
  domainVerificationResultSchema,
  paginationQuerySchema,
  planResponseSchema,
  platformHealthResponseSchema,
  publicTenantResponseSchema,
  subscriptionResponseSchema,
  subscriptionStatusResponseSchema,
  tenantResponseSchema,
  updateTenantInputSchema,
} from '@booking/contracts';

// ── Request bodies / queries ─────────────────────────────────────────────────
export class CreatePlanDto extends createZodDto(createPlanInputSchema) {}
export class CreateTenantDto extends createZodDto(createTenantInputSchema) {}
export class UpdateTenantDto extends createZodDto(updateTenantInputSchema) {}
export class AssignSubscriptionDto extends createZodDto(assignSubscriptionInputSchema) {}
export class AddDomainDto extends createZodDto(addDomainInputSchema) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

/** Free-form storefront theme config body (§16.1). Stored as `tenants.theme_config`. */
const updateThemeInputSchema = z.object({ themeConfig: z.record(z.unknown()) });
export class UpdateThemeDto extends createZodDto(updateThemeInputSchema) {}

// ── Responses ────────────────────────────────────────────────────────────────
export class PlanResponseDto extends createZodDto(planResponseSchema) {}
export class TenantResponseDto extends createZodDto(tenantResponseSchema) {}
export class SubscriptionResponseDto extends createZodDto(subscriptionResponseSchema) {}
export class DomainResponseDto extends createZodDto(domainResponseSchema) {}
export class DomainVerificationResultDto extends createZodDto(domainVerificationResultSchema) {}
export class SubscriptionStatusResponseDto extends createZodDto(subscriptionStatusResponseSchema) {}
export class PublicTenantResponseDto extends createZodDto(publicTenantResponseSchema) {}
export class PlatformHealthResponseDto extends createZodDto(platformHealthResponseSchema) {}

/** Newly created tenant plus its auto-provisioned primary domain (POST /admin/tenants). */
export class CreatedTenantDto extends createZodDto(
  tenantResponseSchema.extend({ primaryDomain: domainResponseSchema }),
) {}

/** A tenant's current subscription with its (possibly null) plan (GET /admin/tenants/:id/subscription). */
export class CurrentSubscriptionDto extends createZodDto(
  z.object({ subscription: subscriptionResponseSchema, plan: planResponseSchema.nullable() }),
) {}

/** The theme payload the dashboard reads back to hydrate the settings form. */
const tenantThemeResponseSchema = z.object({
  name: z.string(),
  vertical: z.string(),
  defaultLocale: z.string(),
  themeConfig: z.record(z.unknown()),
});
export class TenantThemeResponseDto extends createZodDto(tenantThemeResponseSchema) {}
