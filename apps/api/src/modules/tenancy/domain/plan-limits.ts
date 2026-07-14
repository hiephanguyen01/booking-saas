import type { PlanLimits } from '@booking/contracts';

/**
 * Plan-limit rules (TONG-QUAN.md §6.5). Hard limits (partners, listings) block
 * a create when reached; `maxBookingsPerMonth` is a SOFT limit that must never
 * block an end-customer's checkout — it only warns the tenant.
 */

export type HardLimitResource = 'maxPartners' | 'maxListings';

export interface HardLimitCheck {
  allowed: boolean;
  limit: number;
  current: number;
}

/** A create is allowed while strictly below the cap. */
export function checkHardLimit(current: number, limit: number): HardLimitCheck {
  return { allowed: current < limit, limit, current };
}

export interface SoftLimitCheck {
  /** Always true for a soft limit — checkout is never blocked. */
  allowed: true;
  overLimit: boolean;
  limit: number;
  current: number;
}

export function checkBookingSoftLimit(current: number, limit: number): SoftLimitCheck {
  return { allowed: true, overLimit: current >= limit, limit, current };
}

export function isModuleEnabled(
  limits: PlanLimits,
  key: 'customDomain' | 'affiliateModule',
): boolean {
  return limits[key] === true;
}
