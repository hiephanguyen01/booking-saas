import { Inject, Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
  type LedgerEntryRecord,
} from '../../domain/ports/ledger-repository.port';

/**
 * Paginated tenant ledger view (§13.3): the journal/ledger lines for the tenant,
 * newest first — powers the dashboard finance ledger screen.
 */
@Injectable()
export class ListTenantLedgerUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: PaginationQuery): Promise<{ items: LedgerEntryRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.ledger.listEntries(tx, query.page, query.pageSize));
  }
}
