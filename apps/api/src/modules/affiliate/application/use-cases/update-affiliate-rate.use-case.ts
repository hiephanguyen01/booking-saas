import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  TENANT_SHARE_FLOOR_CODE,
  violatesTenantShareFloor,
} from '../../../finance/domain/commission-rate-guard';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateRecord,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';

/**
 * Set (or clear) an affiliate's `custom_rate` (§15.2). A custom rate is a whole
 * percent; before saving it is checked against the tenant-default commission rule
 * so `platform% + affiliate% ≤ tenant%` still holds (§3.3) — the same guard the
 * commission-rule editor uses. Clearing (null) always passes.
 */
@Injectable()
export class UpdateAffiliateRateUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, affiliateId: string, customRate: bigint | null): Promise<AffiliateRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.affiliates.findById(tx, affiliateId);
      if (!existing) {
        throw new NotFoundException({ statusCode: 404, code: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' });
      }
      if (customRate !== null) await this.assertWithinTenantShare(tx, customRate);
      return this.affiliates.setCustomRate(tx, affiliateId, customRate);
    });
  }

  /** Guard the custom rate against the tenant-default rule (percent rules only). */
  private async assertWithinTenantShare(tx: PrismaTx, customRate: bigint): Promise<void> {
    const rule = await tx.commissionRule.findFirst({
      where: { appliesTo: 'tenant_default' },
      orderBy: { createdAt: 'desc' },
      select: { tenantRateType: true, tenantRate: true, platformRate: true },
    });
    if (!rule) return; // no baseline rule → nothing to compare against
    const violates = violatesTenantShareFloor({
      tenantRateType: rule.tenantRateType,
      tenantRate: rule.tenantRate,
      platformRate: rule.platformRate,
      affiliateRateType: 'percent',
      affiliateRate: customRate,
      isHouse: false,
    });
    if (violates) {
      throw new BadRequestException({
        statusCode: 400,
        code: TENANT_SHARE_FLOOR_CODE,
        message: 'platform% + affiliate% would exceed the tenant commission',
      });
    }
  }
}
