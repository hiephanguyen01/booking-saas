import type {
  CustomerFavoriteListResponse,
  FavoriteEntryResponse,
  FavoriteListResponse,
  FavoriteSummaryResponse,
  PublicListingResponse,
  SaleCampaignSummary,
} from '@booking/contracts';
import type {
  CustomerFavoritePage,
  FavoriteCardRecord,
  FavoriteEntryRecord,
  FavoriteListPage,
  FavoriteSummaryRecord,
} from '../domain/ports/favorite-reader.port';
import { selectSaleCampaign } from '../../../shared/domain/pricing/sale-campaign';

export function toFavoriteCard(record: FavoriteCardRecord, now: Date): PublicListingResponse {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    slug: record.slug,
    listingTypeSlug: record.listingTypeSlug,
    attributes: record.attributes,
    photos: record.photos,
    priceFrom: record.priceFrom,
    // `priceFrom` stays the configured base — a favorites card carries no dates
    // to price a sale against. The campaign is summarized in the resource
    // timezone that owns each represented listing, never the viewer timezone.
    campaign: favoriteCampaign(record, now),
    itemLabel: record.itemLabel,
    ratingAvg: record.ratingAvg,
    reviewCount: record.reviewCount,
    provinceCode: record.provinceCode,
    provinceName: record.provinceName,
    wardCode: record.wardCode,
    wardName: record.wardName,
    address: record.address,
  };
}

export function toCustomerFavoriteListResponse(
  page: CustomerFavoritePage,
  query: { page: number; pageSize: number },
  now: Date,
): CustomerFavoriteListResponse {
  return {
    items: page.items.map((record) => toFavoriteCard(record, now)),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
  };
}

/** Select one complete campaign summary when a favorite represents a group. */
function favoriteCampaign(record: FavoriteCardRecord, now: Date): SaleCampaignSummary | null {
  let winner: ReturnType<typeof selectSaleCampaign> = null;
  for (const source of record.campaignSources) {
    const candidate = selectSaleCampaign(source.pricingRules, now, source.resourceTimezone);
    if (candidate && (winner === null || campaignOutranks(candidate, winner))) winner = candidate;
  }
  return winner?.summary ?? null;
}

/** Same public ordering as the campaign kernel: deeper, named, sooner. */
function campaignOutranks(
  candidate: NonNullable<ReturnType<typeof selectSaleCampaign>>,
  current: NonNullable<ReturnType<typeof selectSaleCampaign>>,
): boolean {
  if (candidate.summary.discountPercent !== current.summary.discountPercent)
    return candidate.summary.discountPercent > current.summary.discountPercent;
  if ((candidate.summary.label !== null) !== (current.summary.label !== null))
    return candidate.summary.label !== null;
  if (candidate.endsAt === null || current.endsAt === null) return current.endsAt === null;
  return candidate.endsAt < current.endsAt;
}

function toFavoriteEntry(record: FavoriteEntryRecord): FavoriteEntryResponse {
  return {
    id: record.id,
    customerName: record.customerName,
    customerAvatarUrl: null,
    target: record.target,
    targetId: record.targetId,
    targetTitle: record.targetTitle,
    targetSlug: record.targetSlug,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toFavoriteListResponse(
  page: FavoriteListPage,
  query: { page: number; pageSize: number },
): FavoriteListResponse {
  return {
    items: page.items.map(toFavoriteEntry),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
    counts: page.counts,
  };
}

export function toFavoriteSummaryResponse(record: FavoriteSummaryRecord): FavoriteSummaryResponse {
  return {
    total: record.total,
    uniqueCustomers: record.uniqueCustomers,
    topTargets: record.topTargets,
  };
}
