import type { WithholdingRateCandidate } from '../../../../shared/domain/tax/withholding';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const WITHHOLDING_RATE_REPOSITORY = Symbol('WITHHOLDING_RATE_REPOSITORY');

export interface IWithholdingRateRepository {
  /** The national schedule is small; selection remains pure and in-memory. */
  list(tx: PrismaTx): Promise<WithholdingRateCandidate[]>;
}
