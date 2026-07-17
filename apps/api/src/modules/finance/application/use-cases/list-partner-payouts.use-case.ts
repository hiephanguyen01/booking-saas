import { Inject, Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';

/**
 * A partner's own payout runs (§13.3), every status included.
 *
 * The partner revenue view otherwise has to reconstruct a payout history from
 * settled ledger entries, which can only ever show payouts that were already
 * paid — a pending run (money promised, not yet transferred) or a failed one
 * (needs the partner to fix their payout info) writes no ledger entry and would
 * be invisible. Read the payouts themselves instead.
 */
@Injectable()
export class ListPartnerPayoutsUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    query: PaginationQuery,
  ): Promise<{ items: PayoutRecord[]; total: number }> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.payouts.listForPayee(tx, 'partner', partnerId, query),
    );
  }
}
