import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';

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
        throw new NotFoundException({
          statusCode: 404,
          code: 'PRICING_RULE_NOT_FOUND',
          message: 'Pricing rule not found',
        });
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
