import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { StoredPayoutPolicy } from '../value-objects/payout-policy.value-object';

export const PAYOUT_POLICY_STORE = Symbol('PAYOUT_POLICY_STORE');

export interface IPayoutPolicyStore {
  readTenantSettings(tx: PrismaTx, tenantId: string): Promise<unknown>;
  save(
    tx: PrismaTx,
    tenantId: string,
    policy: StoredPayoutPolicy,
  ): Promise<boolean>;
}
