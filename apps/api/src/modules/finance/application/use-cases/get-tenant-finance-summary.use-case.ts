import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { LEDGER_REPOSITORY, type ILedgerRepository, type OwnerBalance } from '../../domain/ports/ledger-repository.port';

export interface TenantFinanceSummary {
  netRevenue: bigint;
  partnerPayable: bigint;
  affiliatePayable: bigint;
  platformFeePayable: bigint;
  partnerBalances: OwnerBalance[];
  affiliateBalances: OwnerBalance[];
}

/** Tenant finance overview (§13.3): net revenue + amounts payable, from the ledger. */
@Injectable()
export class GetTenantFinanceSummaryUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<TenantFinanceSummary> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const partnerBalances = await this.ledger.balancesByType(tx, 'partner');
      const affiliateBalances = await this.ledger.balancesByType(tx, 'affiliate');
      const platform = await this.ledger.ownerBalance(tx, 'platform', null);
      const revenue = await this.ledger.ownerBalance(tx, 'tenant', tenantId);
      const net = (b: OwnerBalance) => b.credit - b.debit;
      return {
        netRevenue: net(revenue),
        partnerPayable: partnerBalances.reduce((acc, b) => acc + net(b), 0n),
        affiliatePayable: affiliateBalances.reduce((acc, b) => acc + net(b), 0n),
        platformFeePayable: net(platform),
        partnerBalances,
        affiliateBalances,
      };
    });
  }
}
