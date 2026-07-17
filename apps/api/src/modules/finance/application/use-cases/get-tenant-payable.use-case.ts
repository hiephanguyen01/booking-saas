import { Injectable } from '@nestjs/common';
import type { TenantPayableQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  ComputePayoutPayableUseCase,
  type PayableSnapshot,
} from './compute-payout-payable.use-case';

/**
 * Preview what a payout run for one payee would pay right now (§7.7) — the number
 * a payout UI must show, alongside the policy inputs that explain it.
 *
 * Delegates to the same `ComputePayoutPayableUseCase.execute()` that
 * `CreatePayoutUseCase` pays from, so the preview cannot drift from the run.
 */
@Injectable()
export class GetTenantPayableUseCase {
  constructor(
    private readonly payable: ComputePayoutPayableUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: TenantPayableQuery): Promise<PayableSnapshot> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.payable.execute(tx, tenantId, query.payeeType, query.payeeId),
    );
  }
}
