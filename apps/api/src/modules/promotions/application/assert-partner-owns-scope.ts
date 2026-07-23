import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { PromoAppliesTo } from '../domain/promotion-discount';
import {
  PromoScopeNotOwned,
  PromoScopeRequired,
  PromoScopeUnsupported,
} from '../domain/errors/promotion-errors';
import { resolveFundingPartnerId } from './resolve-funding-partner';

/**
 * A partner-created promotion (§12.2) may only target the partner's own inventory —
 * the `partner` scope (itself), or one of its own listings / listing groups. The
 * wide scopes (`all` / `listing_type` / `category`) would span other partners and
 * are rejected. Returns the effective `appliesToId` (the partner id for a `partner`
 * scope). Runs inside the tenant tx, so RLS confirms the target belongs to the tenant.
 */
export async function assertPartnerOwnsScope(
  tx: PrismaTx,
  partnerId: string,
  appliesTo: PromoAppliesTo,
  appliesToId: string | null,
): Promise<string> {
  if (appliesTo === 'partner') return partnerId; // scoped to the partner itself
  if (appliesTo === 'listing' || appliesTo === 'listing_group') {
    if (!appliesToId) {
      throw new PromoScopeRequired();
    }
    const owner = await resolveFundingPartnerId(tx, appliesTo, appliesToId);
    if (owner !== partnerId) {
      throw new PromoScopeNotOwned();
    }
    return appliesToId;
  }
  throw new PromoScopeUnsupported();
}
