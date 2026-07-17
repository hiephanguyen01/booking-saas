import type { CancellationPolicySummary } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const CANCELLATION_POLICY_REPOSITORY = Symbol('CANCELLATION_POLICY_REPOSITORY');

export interface ICancellationPolicyRepository {
  /** The tenant's cancellation policies, ordered by name (for the partner form picker). */
  list(tx: PrismaTx): Promise<CancellationPolicySummary[]>;
}
