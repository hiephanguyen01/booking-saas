import type { CancellationPolicySource, CancellationPolicySummary } from '@booking/contracts';

/**
 * Which cancellation policy actually governs a listing (§11.3).
 *
 * Three-tier fallback: the listing's own policy wins, else the owning partner's
 * default, else the tenant's default. `source` tells the storefront which tier
 * answered so it can label the policy ("set by the partner" vs "site default").
 * A listing with no policy at any tier returns `{ null, null }` — bookings then
 * carry no cancellation terms rather than inventing a default.
 *
 * Pure and framework-free: the repository resolves the three candidates from the
 * DB, this decides which one applies.
 */
export function resolveEffectivePolicy(
  own: CancellationPolicySummary | null,
  partnerDefault: CancellationPolicySummary | null,
  tenantDefault: CancellationPolicySummary | null,
): { policy: CancellationPolicySummary | null; source: CancellationPolicySource | null } {
  if (own) return { policy: own, source: 'listing' };
  if (partnerDefault) return { policy: partnerDefault, source: 'partner' };
  if (tenantDefault) return { policy: tenantDefault, source: 'tenant' };
  return { policy: null, source: null };
}
