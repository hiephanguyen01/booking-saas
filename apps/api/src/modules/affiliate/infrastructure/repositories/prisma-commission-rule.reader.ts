import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CommissionRuleSnapshot,
  ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';

@Injectable()
export class PrismaCommissionRuleReader implements ICommissionRuleReader {
  async findTenantDefault(tx: PrismaTx): Promise<CommissionRuleSnapshot | null> {
    // Newest `tenant_default` wins — the same baseline the commission-rule editor
    // guards against. RLS scopes the read to the current tenant.
    const rule = await tx.commissionRule.findFirst({
      where: { appliesTo: 'tenant_default' },
      orderBy: { createdAt: 'desc' },
      select: {
        tenantRateType: true,
        tenantRate: true,
        platformRate: true,
        affiliateRateType: true,
        affiliateRate: true,
      },
    });
    return rule ?? null;
  }
}
