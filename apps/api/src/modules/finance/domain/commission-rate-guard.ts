import type { RateType } from './commission-split';

/**
 * Commission-rate save guard (TONG-QUAN.md §3.3, Risk #5). When a tenant
 * configures a rule the platform fee + affiliate commission must fit inside the
 * tenant's own commission, otherwise the tenant's net share goes negative:
 *
 *   `platform% + affiliate% ≤ tenant%`
 *
 * The check is pure so it is unit-testable without the DB. It is only meaningful
 * when every leg is expressed as a **percent** — a `fixed` leg cannot be compared
 * without a concrete booking amount, so those combinations are left to the split
 * invariant + `PARTNER_SHARE_FLOORED` flag at booking time (§13.1). It is **waived
 * entirely for a house partner** (§7.3): the tenant sells its own inventory, the
 * platform fee is taken on GMV and there is no partner-payable step, so the floor
 * does not apply.
 */
export const TENANT_SHARE_FLOOR_CODE = 'COMMISSION_RATES_NEGATIVE_TENANT';

export interface CommissionRateGuardInput {
  tenantRateType: RateType;
  /** `percent`: whole percent (15 = 15%). `fixed`: VND đồng. */
  tenantRate: bigint;
  /** Platform fee, whole percent. */
  platformRate: number;
  affiliateRateType: RateType;
  /** `percent`: whole percent. `fixed`: VND đồng. */
  affiliateRate: bigint;
  /** Tenant-owned inventory (§7.3) — the floor does not apply. */
  isHouse: boolean;
}

/**
 * True when saving these rates would drive the tenant's share negative, i.e.
 * `platform% + affiliate% > tenant%`. Returns false (no violation) for a house
 * partner and for any combination involving a `fixed` tenant/affiliate rate,
 * which cannot be assessed on rates alone.
 */
export function violatesTenantShareFloor(input: CommissionRateGuardInput): boolean {
  if (input.isHouse) return false;
  // Only a fully-percent rule is comparable on rates alone (§3.3).
  if (input.tenantRateType !== 'percent' || input.affiliateRateType !== 'percent') return false;
  const tenant = Number(input.tenantRate);
  const affiliate = Number(input.affiliateRate);
  return input.platformRate + affiliate > tenant;
}
