import type { CreateCommissionRuleInput } from '@booking/contracts';

/**
 * Safe baseline provisioned for a newly-created tenant.
 *
 * Tenant owners can change their own and affiliate rates afterwards. The
 * platform rate remains platform-owned and is inherited by every override.
 */
export const NEW_TENANT_PLATFORM_RATE = 2;

export const NEW_TENANT_DEFAULT_COMMISSION: CreateCommissionRuleInput = {
  appliesTo: 'tenant_default',
  tenantRateType: 'percent',
  tenantRate: '15',
  affiliateRateType: 'percent',
  affiliateRate: '0',
};
