import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const COMMISSION_COVERAGE_READER = Symbol('COMMISSION_COVERAGE_READER');

export interface CommissionCoverageRule {
  id: string;
  rateType: 'percent' | 'fixed';
  rate: bigint;
}

export interface CommissionCoverageTarget {
  partnerId: string;
  listingTypeId: string;
  categoryId: string | null;
}

export interface ICommissionCoverageReader {
  findEffectiveRule(
    tx: PrismaTx,
    target: CommissionCoverageTarget,
  ): Promise<CommissionCoverageRule | null>;
}
