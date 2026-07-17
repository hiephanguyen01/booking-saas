import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

/**
 * payout.paid (payeeType=affiliate) → the affiliate's confirmed commissions
 * become `paid` (§7.8). Idempotent and opens its own `forTenant` tx — outbox
 * handlers carry no request context.
 */
@Injectable()
export class MarkCommissionsPaidUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, affiliateId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, (tx) => this.commissions.markConfirmedPaid(tx, affiliateId));
  }
}
