import { Injectable } from '@nestjs/common';
import type { TenantPayableQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { PayoutPayableService, type PayableSnapshot } from '../payout-payable.service';

/**
 * Preview what a payout run for one payee would pay right now (§7.7) — the number
 * a payout UI must show, alongside the policy inputs that explain it.
 *
 * Delegates to the same `PayoutPayableService.compute()` that `CreatePayoutUseCase`
 * pays from, so the preview cannot drift from the run.
 */
@Injectable()
export class GetTenantPayableUseCase {
  constructor(
    private readonly payable: PayoutPayableService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: TenantPayableQuery): Promise<PayableSnapshot> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.payable.compute(tx, tenantId, query.payeeType, query.payeeId),
    );
  }
}
