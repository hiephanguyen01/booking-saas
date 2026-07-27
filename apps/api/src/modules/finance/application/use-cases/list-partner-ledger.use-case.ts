import { Inject, Injectable } from '@nestjs/common';
import type { PartnerLedgerQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
  type LedgerEntryView,
} from '../../domain/ports/ledger-repository.port';

/**
 * A partner's own ledger history (§13.3) — paginated + filterable, newest first.
 * The owner is FORCED to the partner in scope (`ownerType: 'partner'`, `ownerId`
 * from context), never from the client, so a partner can only ever read its own
 * ledger. RLS also scopes `ledger_accounts`/`ledger_entries` to the tenant.
 */
@Injectable()
export class ListPartnerLedgerUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    query: PartnerLedgerQuery,
  ): Promise<RepoPage<LedgerEntryView>> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.ledger.listEntries(tx, query.page, query.pageSize, {
        ownerType: 'partner',
        ownerId: partnerId,
        entryType: query.entryType,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      }),
    );
  }
}
