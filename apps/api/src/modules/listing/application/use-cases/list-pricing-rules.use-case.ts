import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
  type PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';

@Injectable()
export class ListPricingRulesUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, listingId: string): Promise<PricingRuleRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.rules.listByListing(tx, listingId));
  }
}
