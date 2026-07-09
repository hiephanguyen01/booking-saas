import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CreatePayoutInput } from '@booking/shared';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { addDays, utcNow } from '../../../../shared/time/time';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import { LEDGER_REPOSITORY, type ILedgerRepository } from '../../domain/ports/ledger-repository.port';

interface PayoutPolicy {
  holdingDays: number;
  minAmount: bigint;
}

/**
 * Open a manual payout run (§7.7). It covers only payable that has cleared the
 * tenant's holding period (a dispute buffer) and is not already claimed by an
 * unsettled run — no ledger entry is written until the transfer is marked paid.
 */
@Injectable()
export class CreatePayoutUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, input: CreatePayoutInput, createdBy: string | null): Promise<PayoutRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const policy = await this.policy(tx);
      const cutoff = addDays(utcNow(), -policy.holdingDays);
      const mature = await this.ledger.maturePayable(tx, input.payeeType, input.payeeId, cutoff);
      const outstanding = await this.payouts.outstandingForPayee(tx, input.payeeType, input.payeeId);
      const available = mature - outstanding;

      if (available <= 0n) {
        throw new BadRequestException({ statusCode: 400, code: 'NOTHING_TO_PAY', message: 'No matured payable for this payee' });
      }
      if (available < policy.minAmount) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'BELOW_MINIMUM',
          message: `Payable ${available} is below the ${policy.minAmount} minimum`,
        });
      }

      const payout = await this.payouts.create(tx, tenantId, {
        payeeType: input.payeeType,
        payeeId: input.payeeId,
        amount: available,
        periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
        periodTo: input.periodTo ? new Date(input.periodTo) : cutoff,
        createdBy,
      });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: createdBy, action: 'payout.created', entityType: 'payout', entityId: payout.id, data: { amount: available.toString() } },
      });
      return payout;
    });
  }

  private async policy(tx: PrismaTx): Promise<PayoutPolicy> {
    const tenant = await tx.tenant.findFirst({ select: { settings: true } });
    const payout = (tenant?.settings as { payout?: { holdingDays?: number; minAmount?: string | number } } | null)?.payout;
    const holdingDays = typeof payout?.holdingDays === 'number' ? payout.holdingDays : 3;
    const minAmount = payout?.minAmount !== undefined && /^\d+$/.test(String(payout.minAmount)) ? BigInt(payout.minAmount) : 0n;
    return { holdingDays, minAmount };
  }
}
