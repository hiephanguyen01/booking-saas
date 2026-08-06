import type {
  PublicListingDetailWithTimezoneResponse,
  PublicListingGroupDetailResponse,
  PublicListingResponse,
} from '@booking/contracts';

/**
 * Detail responses → the card shape the account grids render.
 *
 * "Đã xem gần đây" is rebuilt from slugs on a cookie, so it can only read the
 * *detail* endpoints — there is no card-shaped read for an arbitrary set of
 * slugs. These two functions close that gap and are the only place the mapping
 * lives.
 */

const DIGITS_RE = /^\d+$/;

export function listingDetailToCard(
  detail: PublicListingDetailWithTimezoneResponse,
): PublicListingResponse {
  return {
    id: detail.id,
    kind: 'listing',
    title: detail.title,
    slug: detail.slug,
    listingTypeSlug: detail.listingTypeSlug,
    attributes: detail.attributes,
    photos: detail.photos,
    priceFrom: detail.priceFrom,
    itemLabel: null,
    ratingAvg: detail.ratingAvg,
    reviewCount: detail.reviewCount,
    provinceCode: detail.provinceCode,
    provinceName: detail.provinceName,
    wardCode: detail.wardCode,
    wardName: detail.wardName,
    address: detail.address,
  };
}

export function groupDetailToCard(
  detail: PublicListingGroupDetailResponse,
): PublicListingResponse {
  return {
    id: detail.id,
    kind: 'group',
    title: detail.title,
    slug: detail.slug,
    listingTypeSlug: detail.listingTypeSlug,
    // A group carries no attributes of its own; each child listing has them.
    attributes: {},
    photos: detail.photos,
    priceFrom: lowestChildPrice(detail.listings),
    itemLabel: detail.itemLabel,
    ratingAvg: detail.ratingAvg,
    reviewCount: detail.reviewCount,
    provinceCode: detail.provinceCode,
    provinceName: detail.provinceName,
    wardCode: detail.wardCode,
    wardName: detail.wardName,
    address: detail.address,
  };
}

/**
 * The group's "from" price is the cheapest published child, matching what the
 * group's own card projection shows. This reduces values already present in the
 * response rather than deriving a price from mode config — that stays in the
 * backend's pricing kernel.
 */
function lowestChildPrice(
  children: readonly { priceFrom: string | null }[],
): string | null {
  let lowest: bigint | null = null;
  for (const child of children) {
    if (!child.priceFrom || !DIGITS_RE.test(child.priceFrom)) continue;
    const price = BigInt(child.priceFrom);
    if (lowest === null || price < lowest) lowest = price;
  }
  return lowest === null ? null : lowest.toString();
}
