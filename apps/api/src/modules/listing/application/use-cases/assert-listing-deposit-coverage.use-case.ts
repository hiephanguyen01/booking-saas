import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_COVERAGE_READER,
  type CommissionCoverageTarget,
  type ICommissionCoverageReader,
} from '../../domain/ports/commission-coverage-reader.port';

/** Enforce the percentage guard while a Partner creates or edits a listing. */
@Injectable()
export class AssertListingDepositCoverageUseCase {
  constructor(
    @Inject(COMMISSION_COVERAGE_READER)
    private readonly commissions: ICommissionCoverageReader,
  ) {}

  async execute(
    tx: PrismaTx,
    target: CommissionCoverageTarget & { isHouse: boolean },
    depositPercent: number,
  ): Promise<void> {
    if (target.isHouse) return;
    const rule = await this.commissions.findEffectiveRule(tx, target);
    if (rule?.rateType !== 'percent' || BigInt(depositPercent) >= rule.rate) return;
    throw new BadRequestException({
      statusCode: 400,
      code: 'DEPOSIT_BELOW_TENANT_COMMISSION',
      message: `Deposit ${depositPercent}% must be at least the tenant commission ${rule.rate}%`,
      details: {
        depositPercent,
        minimumDepositPercent: Number(rule.rate),
        commissionRuleId: rule.id,
      },
    });
  }
}
