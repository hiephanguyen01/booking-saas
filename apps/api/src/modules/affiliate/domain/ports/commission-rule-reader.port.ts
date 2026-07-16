import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RateType } from '../../../finance/domain/commission-split';

export const COMMISSION_RULE_READER = Symbol('COMMISSION_RULE_READER');

/** The tenant-default commission rule, read-only, as the affiliate module needs it. */
export interface CommissionRuleSnapshot {
  tenantRateType: RateType;
  /** `percent`: whole percent. `fixed`: VND đồng. */
  tenantRate: bigint;
  /** Platform fee, whole percent. */
  platformRate: number;
  affiliateRateType: RateType;
  affiliateRate: bigint;
}

/**
 * Read-only view of the tenant's baseline commission rule, which the affiliate
 * module needs for two things: the `platform% + affiliate% ≤ tenant%` save guard
 * (§3.3) and resolving an affiliate's effective rate when `custom_rate` is null
 * (§15.2). Both are reads of finance-owned configuration — never a write, never a
 * call into the finance module's services.
 *
 * A port rather than raw `tx.commissionRule` in the use cases so the dependency is
 * declared and mockable, and so the "which rule is the baseline" question has one
 * answer instead of one per caller.
 */
export interface ICommissionRuleReader {
  /**
   * The tenant's most recent `tenant_default` rule, or null when the tenant has
   * configured none. Runs on the caller's RLS-scoped `tx`.
   */
  findTenantDefault(tx: PrismaTx): Promise<CommissionRuleSnapshot | null>;
}
