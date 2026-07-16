import { Inject, Injectable } from '@nestjs/common';
import type { LedgerQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
  type LedgerEntryView,
} from '../../domain/ports/ledger-repository.port';

/**
 * Paginated tenant ledger view (§13.3): the journal/ledger lines for the tenant,
 * newest first, narrowed by the requested filters — powers the dashboard finance
 * ledger screen.
 */
@Injectable()
export class ListTenantLedgerUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: LedgerQuery): Promise<{ items: LedgerEntryView[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.ledger.listEntries(tx, query.page, query.pageSize, {
        bookingId: query.bookingId,
        ownerType: query.ownerType,
        entryType: query.entryType,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      }),
    );
  }
}
