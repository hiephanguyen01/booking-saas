import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
  type LedgerEntryView,
} from '../../domain/ports/ledger-repository.port';

export interface PartnerFinance {
  balance: bigint;
  entries: LedgerEntryView[];
}

/** Partner finance view (§13.3): current payable balance + recent ledger entries. */
@Injectable()
export class GetPartnerFinanceUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string): Promise<PartnerFinance> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const balance = await this.ledger.ownerBalance(tx, 'partner', partnerId);
      const entries = await this.ledger.entriesForOwner(tx, 'partner', partnerId, 100);
      return { balance: balance.credit - balance.debit, entries };
    });
  }
}
