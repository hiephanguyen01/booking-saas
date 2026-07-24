import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { TrackReferralInput, TrackReferralResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  AFFILIATE_ATTRIBUTION_READER,
  type IAffiliateAttributionReader,
} from '../../domain/ports/affiliate-attribution-reader.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
} from '../../domain/ports/referral-link-repository.port';
import { normalizeReferralCode } from '../../domain/referral-code';

/**
 * Storefront referral click (§15.1): resolve the tenant from Host, match the code
 * to an approved affiliate's link, then log the click + bump `clicks_count`. The
 * response only tells the BFF whether to set the attribution cookie — it never
 * leaks which affiliate. Unknown / suspended codes return `{ valid: false }`.
 */
@Injectable()
export class TrackReferralUseCase {
  constructor(
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    @Inject(AFFILIATE_ATTRIBUTION_READER)
    private readonly attributionReader: IAffiliateAttributionReader,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    input: TrackReferralInput,
    meta: { ip?: string; userAgent?: string },
  ): Promise<TrackReferralResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const code = normalizeReferralCode(input.code);
    if (!code) return { valid: false };

    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const link = await this.attributionReader.findApprovedForClick(tx, code);
      if (!link) return { valid: false };

      await this.links.recordClick(tx, tenant.id, {
        referralLinkId: link.linkId,
        visitorId: input.visitorId ?? null,
        ipHash: meta.ip ? createHash('sha256').update(meta.ip).digest('hex') : null,
        userAgent: meta.userAgent ?? null,
      });
      await this.links.incrementClicks(tx, link.linkId);
      return { valid: true };
    });
  }
}
