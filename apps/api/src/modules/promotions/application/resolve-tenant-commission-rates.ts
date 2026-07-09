import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../shared/time/time';

/**
 * The tenant's default commission rates, read straight from `commission_rules`
 * in-tenant (RLS-scoped). The finance module's `ResolveCommissionService` is
 * booking-target-scoped (it needs a partner/listing-type) whereas a promotion is
 * tenant-wide with no single partner, so the §12.4 guard resolves the
 * `tenant_default` rule directly rather than crossing the module boundary — this
 * keeps the read a plain, effective-at-now lookup with no cross-module service call.
 */
export interface TenantCommissionRates {
  tenantRateType: 'percent' | 'fixed';
  tenantRate: number;
  platformRate: number;
  affiliateRateType: 'percent' | 'fixed';
  affiliateRate: number;
}

/** Resolve the effective `tenant_default` commission rates, or null when none is configured. */
export async function resolveTenantCommissionRates(tx: PrismaTx): Promise<TenantCommissionRates | null> {
  const now = utcNow();
  const rows = await tx.commissionRule.findMany({
    where: {
      appliesTo: 'tenant_default',
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }],
    },
    orderBy: { effectiveFrom: 'desc' },
    take: 1,
  });
  const rule = rows[0];
  if (!rule) return null;
  return {
    tenantRateType: rule.tenantRateType,
    tenantRate: Number(rule.tenantRate),
    platformRate: rule.platformRate,
    affiliateRateType: rule.affiliateRateType,
    affiliateRate: Number(rule.affiliateRate),
  };
}
