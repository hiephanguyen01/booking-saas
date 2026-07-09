import { BadRequestException, type Logger } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { evaluateTenantShareRisk } from '../domain/tenant-share-risk';
import { resolveTenantCommissionRates } from './resolve-tenant-commission-rates';

export const PROMO_TENANT_SHARE_NEGATIVE_CODE = 'PROMO_TENANT_SHARE_NEGATIVE';

export interface TenantShareGuardParams {
  fundedBy: 'tenant' | 'partner';
  discountType: 'percent' | 'fixed';
  /** `percent`: whole percent. `fixed`: VND đồng. */
  discountValue: number;
}

/**
 * §12.4 guard for a `funded_by = tenant` promotion: resolve the tenant's default
 * commission rates in-tenant and classify the discount's risk of driving the
 * tenant share negative — **block** when certain, **warn** (log) otherwise. A
 * no-op when no `tenant_default` rule is configured (nothing to compare against).
 */
export async function assertTenantShareRisk(tx: PrismaTx, params: TenantShareGuardParams, logger: Logger): Promise<void> {
  if (params.fundedBy !== 'tenant') return;
  const rates = await resolveTenantCommissionRates(tx);
  if (!rates) return;

  const verdict = evaluateTenantShareRisk({
    fundedBy: params.fundedBy,
    discountType: params.discountType,
    discountValue: params.discountValue,
    tenantRateType: rates.tenantRateType,
    tenantRate: rates.tenantRate,
    platformRate: rates.platformRate,
    affiliateRateType: rates.affiliateRateType,
    affiliateRate: rates.affiliateRate,
  });

  if (verdict.decision === 'block') {
    throw new BadRequestException({ statusCode: 400, code: PROMO_TENANT_SHARE_NEGATIVE_CODE, message: verdict.reason });
  }
  if (verdict.decision === 'warn') {
    logger.warn(verdict.reason);
  }
}
