import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { PromoAppliesTo } from '../domain/promotion-discount';
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
      throw new BadRequestException({ statusCode: 400, code: 'PROMO_SCOPE_REQUIRED', message: 'A target is required' });
    }
    const owner = await resolveFundingPartnerId(tx, appliesTo, appliesToId);
    if (owner !== partnerId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROMO_SCOPE_NOT_OWNED',
        message: 'A partner can only promote its own listings',
      });
    }
    return appliesToId;
  }
  throw new BadRequestException({
    statusCode: 400,
    code: 'PROMO_SCOPE_UNSUPPORTED',
    message: 'A partner promotion must target the partner itself, one of its listings, or a listing group',
  });
}
