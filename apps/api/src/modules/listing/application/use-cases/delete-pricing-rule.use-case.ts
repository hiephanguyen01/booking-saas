import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';
import { PricingRuleNotFound } from '../../domain/errors/pricing-rule-errors';

@Injectable()
export class DeletePricingRuleUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.rules.findById(tx, id);
      if (!existing) {
        throw new PricingRuleNotFound();
      }
      await this.rules.delete(tx, id);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'pricing_rule.deleted',
        payload: { pricingRuleId: id },
      });
    });
  }
}
