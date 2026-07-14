import { BadRequestException } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { PromoAppliesTo } from '../domain/promotion-discount';

/**
 * Resolve the single partner bearing the cost of a `funded_by = partner` promotion
 * from its scope (§12.2): `partner` → the id itself; `listing` / `listing_group` →
 * the owning partner. Throws when the scope cannot identify a partner (the contract
 * already forbids the wide scopes, this is the server-side backstop). Runs inside
 * the tenant tx, so RLS confirms the target belongs to the tenant.
 */
export async function resolveFundingPartnerId(
  tx: PrismaTx,
  appliesTo: PromoAppliesTo,
  appliesToId: string | null,
): Promise<string> {
  const fail = (): never => {
    throw new BadRequestException({
      statusCode: 400,
      code: 'PROMO_FUNDING_PARTNER_UNRESOLVED',
      message: 'A partner-funded promotion must target a partner, listing, or listing group',
    });
  };
  if (!appliesToId) return fail();
  switch (appliesTo) {
    case 'partner':
      return appliesToId;
    case 'listing': {
      const l = await tx.listing.findUnique({ where: { id: appliesToId }, select: { partnerId: true } });
      return l?.partnerId ?? fail();
    }
    case 'listing_group': {
      const g = await tx.listingGroup.findUnique({ where: { id: appliesToId }, select: { partnerId: true } });
      return g?.partnerId ?? fail();
    }
    default:
      return fail();
  }
}
