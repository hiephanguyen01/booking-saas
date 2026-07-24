import { Inject, Injectable } from '@nestjs/common';
import type { CreatePayoutInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ComputePayoutPayableUseCase } from './compute-payout-payable.use-case';
import { Payout } from '../../domain/entities/payout.entity';

/**
 * Open a manual payout run (§7.7). It covers only payable that has cleared the
 * tenant's holding period (a dispute buffer) and is not already claimed by an
 * unsettled run — no ledger entry is written until the transfer is marked paid.
 *
 * What is payable is computed by `ComputePayoutPayableUseCase`, the same call that
 * backs `GET /tenant/finance/payable`, so the amount previewed there is exactly the
 * amount paid here.
 */
@Injectable()
export class CreatePayoutUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly payable: ComputePayoutPayableUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    input: CreatePayoutInput,
    createdBy: string | null,
  ): Promise<PayoutRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      // Serialize preview + claim for this payee. The second concurrent request
      // waits, then sees the first run in `outstanding` and cannot double-claim.
      await this.payouts.lockPayee(tx, input.payeeType, input.payeeId);
      const snapshot = await this.payable.execute(tx, tenantId, input.payeeType, input.payeeId);
      const data = Payout.planCreation(snapshot, input, createdBy);
      const payout = await this.payouts.create(tx, tenantId, data);
      if (input.payeeType === 'partner') {
        const allocated = await this.payouts.allocateReleasedSettlements(
          tx,
          tenantId,
          payout.id,
          input.payeeId,
          payout.amount,
        );
        // Throwing rolls the payout and every tentative FIFO allocation back.
        Payout.assertAllocated(payout.amount, allocated);
      }
      await this.audit.write(tx, {
        tenantId,
        actorUserId: createdBy,
        action: 'payout.created',
        entityType: 'payout',
        entityId: payout.id,
        data: { amount: snapshot.available.toString() },
      });
      return payout;
    });
  }
}
