import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { PromoAppliesTo } from '../domain/promotion-discount';
import { PromoScopeTargetInvalid, PromoScopeTargetMissing } from '../domain/errors/promotion-errors';
import type { IPromoContextLookup } from '../domain/ports/promo-context-lookup.port';

/**
 * Server-side guard that `appliesToId` really identifies an entity of the declared
 * `appliesTo` type (§12.2).
 *
 * The contract can only check that the id is *a* uuid — it cannot know which table it
 * came from. Without this check a client that changes `appliesTo` while keeping the
 * previously-picked id (e.g. switching funding to `partner`, which forces the scope to
 * `listing`) stores a category/type uuid under a `listing` scope. That promotion is not
 * rejected anywhere: `scopeMatches()` simply compares it against `ctx.listingId`, never
 * matches, and the promo silently applies to nothing. A cross-type id must therefore be
 * a clean 400 at write time.
 *
 * Returns the resolved target label (useful for logs/responses), or `null` for the
 * `all` scope, which has no target.
 */
export async function assertScopeTargetValid(
  lookup: IPromoContextLookup,
  tx: PrismaTx,
  appliesTo: PromoAppliesTo,
  appliesToId: string | null,
): Promise<string | null> {
  if (appliesTo === 'all') return null;
  if (!appliesToId) {
    throw new PromoScopeTargetMissing();
  }
  const label = await lookup.resolveScopeTargetLabel(tx, appliesTo, appliesToId);
  if (label === null) {
    throw new PromoScopeTargetInvalid(appliesTo, appliesToId);
  }
  return label;
}
