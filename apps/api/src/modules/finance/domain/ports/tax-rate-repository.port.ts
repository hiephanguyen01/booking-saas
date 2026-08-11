import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TaxRateCandidate } from '../../../../shared/domain/tax/tax';

export const TAX_RATE_REPOSITORY = Symbol('TAX_RATE_REPOSITORY');

export interface ITaxRateRepository {
  /** The whole schedule — a handful of rows; selection is pure and in-memory. */
  list(tx: PrismaTx): Promise<TaxRateCandidate[]>;
}
