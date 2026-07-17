import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import type { AffiliateWithUser } from '../../domain/ports/affiliate-repository.port';
import {
  COMMISSION_RULE_READER,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';
import { GetAffiliateMembershipsUseCase } from './get-affiliate-memberships.use-case';

export interface AffiliateMembership {
  affiliate: AffiliateWithUser;
  effectiveRate: EffectiveAffiliateRate;
}

/**
 * The user's affiliate memberships for the portal (§15.3), each carrying the rate
 * it actually earns at. Memberships are discovered cross-tenant on the admin pool
 * (the portal has no tenant context yet), but a membership's fallback rate lives
 * in ITS OWN tenant's commission rules — a separate RLS scope per membership, so
 * each is resolved in its own `forTenant`. They are resolved in sequence: one
 * transaction per tenant, never nested, and a user holds a handful of memberships
 * at most.
 */
@Injectable()
export class ListAffiliateMembershipsUseCase {
  constructor(
    private readonly getMemberships: GetAffiliateMembershipsUseCase,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(userId: string): Promise<AffiliateMembership[]> {
    const memberships = await this.getMemberships.execute(userId);
    const result: AffiliateMembership[] = [];
    for (const affiliate of memberships) {
      const rule = await this.tenantDb.forTenant(affiliate.tenantId, (tx) =>
        this.rules.findTenantDefault(tx),
      );
      result.push({ affiliate, effectiveRate: resolveEffectiveAffiliateRate(affiliate.customRate, rule) });
    }
    return result;
  }
}
