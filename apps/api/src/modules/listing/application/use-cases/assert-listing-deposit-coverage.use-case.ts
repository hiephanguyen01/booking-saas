import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { ListingDepositPolicy } from '../../domain/value-objects/listing-deposit-policy.value-object';
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
    if (target.isHouse) {
      ListingDepositPolicy.fromRule(null).assertCovered({
        isHouse: true,
        depositPercent,
      });
      return;
    }
    const rule = await this.commissions.findEffectiveRule(tx, target);
    ListingDepositPolicy.fromRule(rule).assertCovered({
      isHouse: target.isHouse,
      depositPercent,
    });
  }
}
