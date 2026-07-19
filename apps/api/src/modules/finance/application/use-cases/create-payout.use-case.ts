import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreatePayoutInput, PayoutCycleDto } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { addDays } from '../../../../shared/time/time';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ComputePayoutPayableUseCase } from './compute-payout-payable.use-case';

/** Days a cycle spans, used to derive `period_from` when it is not supplied. */
const CYCLE_DAYS: Record<PayoutCycleDto, number> = { weekly: 7, monthly: 30 };

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

  execute(tenantId: string, input: CreatePayoutInput, createdBy: string | null): Promise<PayoutRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      // Serialize preview + claim for this payee. The second concurrent request
      // waits, then sees the first run in `outstanding` and cannot double-claim.
      await this.payouts.lockPayee(tx, input.payeeType, input.payeeId);
      const snapshot = await this.payable.execute(tx, tenantId, input.payeeType, input.payeeId);

      if (snapshot.ineligibleReason === 'NOTHING_TO_PAY') {
        throw new BadRequestException({ statusCode: 400, code: 'NOTHING_TO_PAY', message: 'No matured payable for this payee' });
      }
      if (snapshot.ineligibleReason === 'BELOW_MINIMUM') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'BELOW_MINIMUM',
          message: `Payable ${snapshot.available} is below the ${snapshot.policy.minAmount} minimum`,
        });
      }

      // Derive the run window from the tenant's cycle (input can override), so a
      // weekly/monthly run covers a consistent period even when unspecified (§7.7).
      const cycle = input.cycle ?? snapshot.policy.cycle;
      const periodTo = input.periodTo ? new Date(input.periodTo) : snapshot.cutoff;
      const periodFrom = input.periodFrom ? new Date(input.periodFrom) : addDays(periodTo, -CYCLE_DAYS[cycle]);

      const payout = await this.payouts.create(tx, tenantId, {
        payeeType: input.payeeType,
        payeeId: input.payeeId,
        amount: snapshot.available,
        periodFrom,
        periodTo,
        createdBy,
      });
      if (input.payeeType === 'partner') {
        const allocated = await this.payouts.allocateReleasedSettlements(
          tx,
          tenantId,
          payout.id,
          input.payeeId,
          payout.amount,
        );
        if (allocated !== payout.amount) {
          // A partner payout must be traceable back to released booking rows.
          // Throwing here rolls the payout and every tentative allocation back.
          throw new ConflictException({
            statusCode: 409,
            code: 'PAYOUT_ALLOCATION_MISMATCH',
            message: 'Partner payable is not fully backed by released settlements',
            details: {
              payoutAmount: payout.amount.toString(),
              allocatedAmount: allocated.toString(),
            },
          });
        }
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
