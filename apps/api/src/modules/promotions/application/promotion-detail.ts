import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { IPromoContextLookup } from '../domain/ports/promo-context-lookup.port';
import type { PromotionRecord } from '../domain/ports/promotion-repository.port';

/** A promotion plus the display names its raw ids stand for (§12.2). */
export interface PromotionDetail extends PromotionRecord {
  fundingPartnerName: string | null;
  createdByPartnerName: string | null;
  appliesToLabel: string | null;
}

/**
 * Resolve a promotion's ids into names for the read-one response. The partner names
 * come from the `partner` bounded context, so they are read through the
 * `IPromoContextLookup` port (a read-only query in this module's own adapter) rather
 * than by importing the partner module's service — modules never call each other's
 * services (§4.3).
 *
 * Name resolution is best-effort: a deleted target yields `null`, never an error —
 * a detail page must still render a promotion whose scope target has since gone.
 */
export async function loadPromotionDetail(
  lookup: IPromoContextLookup,
  tx: PrismaTx,
  promo: PromotionRecord,
): Promise<PromotionDetail> {
  const [fundingPartnerName, createdByPartnerName, appliesToLabel] = await Promise.all([
    promo.fundingPartnerId ? lookup.getPartnerName(tx, promo.fundingPartnerId) : Promise.resolve(null),
    promo.createdByPartnerId ? lookup.getPartnerName(tx, promo.createdByPartnerId) : Promise.resolve(null),
    promo.appliesToId
      ? lookup.resolveScopeTargetLabel(tx, promo.appliesTo, promo.appliesToId)
      : Promise.resolve(null),
  ]);
  return { ...promo, fundingPartnerName, createdByPartnerName, appliesToLabel };
}
