import { Heart, Images, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { Image } from '@booking/ui/components/media/image';
import { RatingStars, RatingSummary } from '~/components/rating-stars';
import { DiscountBadge } from '~/components/discount-badge';
import type {
  EnrichedSearchListing,
  SearchResultContext,
} from '~/features/search/lib/search-state';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { formatListingLocation, formatVnd } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';
import type { ListingFavoriteControl } from '~/features/catalog/lib/listing-card.types';

export function SearchResultCard({
  listing,
  context,
  favoriteControl,
}: {
  listing: EnrichedSearchListing;
  context: SearchResultContext;
  favoriteControl?: ListingFavoriteControl;
}) {
  const locale = useLocale();
  const { t } = useTranslation([NsI18n.Catalog, NsI18n.Listing]);
  const detailPath =
    listing.kind === 'group'
      ? storefrontPaths.listingGroup(locale, listing.slug)
      : storefrontPaths.listing(locale, listing.slug);
  const href = `${detailPath}?${context.query}`;
  const photos = listing.photos.slice(0, 3);
  const location = formatListingLocation(listing);
  const price = formatVnd(listing.priceFrom);
  const regularPrice = formatVnd(listing.regularPriceFrom);
  const discountPercent = calculateDiscountPercent(listing.regularPriceFrom, listing.priceFrom);
  const priceUnit = priceUnitLabel(context, listing.priceUnit);

  return (
    // Below `md` this is the same compact row as `ListingCard`: a phone showed
    // one result per screen when the photo alone was 208px tall.
    //
    // `md:grid-rows-1` is load-bearing: without an explicit row the implicit one
    // is content-sized, so the photo below never had a definite height to
    // resolve its `h-full` against and sized itself from its own aspect ratio
    // instead. A 4:3 source happened to land on this card's 184px, which is why
    // only portrait uploads broke out of the card.
    <article className="group relative flex min-h-32 gap-3 overflow-hidden bg-card p-(--sf-surface-pad) transition-[border-color,box-shadow] rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] shadow-(--sf-surface-shadow) hover:border-primary/50 md:grid md:h-46 md:min-h-0 md:grid-cols-[248px_120px_minmax(0,1fr)] md:grid-rows-1 md:gap-x-1.5 md:p-0">
      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          // `after:-inset-1.5` extends the 32px chip to a 44px tap target while
          // the visible circle keeps the size the card layout is built around.
          className="absolute top-2.5 right-2.5 z-10 flex size-8 items-center justify-center rounded-full bg-background/95 text-primary shadow-md transition-transform after:absolute after:-inset-1.5 after:content-[''] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:top-6 md:right-auto md:left-[310px] md:size-10"
        >
          <Heart
            className="size-4 md:size-5"
            fill={favoriteControl.selected ? 'currentColor' : 'none'}
          />
        </button>
      ) : null}
      <Link
        to={href}
        // No height below `md`: as a flex child the photo stretches to the row,
        // which is both a definite height for the `h-full` image inside and a
        // photo that is always exactly as tall as the card beside it.
        className="relative w-28 shrink-0 overflow-hidden rounded-(--sf-image-radius) bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-full md:w-auto md:rounded-none"
      >
        {photos[0] ? (
          <Image
            src={photos[0]}
            alt={listing.title}
            width={720}
            height={480}
            className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
        {discountPercent !== null ? <DiscountBadge percent={discountPercent} /> : null}
        {listing.photos.length ? (
          <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-foreground/80 px-2 py-1 text-[10px] font-medium text-background backdrop-blur-sm md:hidden">
            <Images className="size-3" aria-hidden="true" />
            {listing.photos.length}
          </span>
        ) : null}
      </Link>

      <div className="relative hidden grid-rows-2 gap-1.5 bg-muted md:grid">
        {[
          { slot: 'secondary', photo: photos[1] },
          { slot: 'tertiary', photo: photos[2] },
        ].map(({ slot, photo }) => (
          <div key={slot} className="min-h-0 overflow-hidden bg-muted">
            {photo ? (
              <Image
                src={photo}
                alt=""
                width={360}
                height={264}
                className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5 pr-0.5 md:justify-center md:gap-3 md:px-5 md:py-4 md:pr-6 md:pl-[18px]">
        <div className="min-w-0">
          <Link
            to={href}
            // `pr-9` keeps the title clear of the favourite chip, which sits over
            // the text column on the row layout instead of over the photo.
            className="line-clamp-2 pr-9 text-[13px] leading-[18px] font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:line-clamp-1 md:pr-0 md:text-lg md:leading-7"
          >
            {listing.title}
          </Link>
          {location ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground md:mt-1 md:gap-2 md:text-sm md:leading-5">
              <MapPin className="size-3.5 shrink-0 md:size-5" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          ) : null}
        </div>

        {/* Rating and price share the last line of the row; from `md:` up the
            column has the room to give each its own. */}
        <div className="mt-auto flex items-end justify-between gap-2 md:mt-0 md:flex-col md:items-stretch md:gap-3">
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground md:justify-between md:text-sm md:leading-5">
            {listing.ratingAvg === null || listing.reviewCount === 0 ? (
              // "Chưa có đánh giá" is an absence, and on the row it competes
              // with the price for a column that truncates it to "Chưa có đánh
              // g…". The empty half-line says the same thing.
              <span className="truncate text-[11px] md:text-sm">{t('catalog:noReviews')}</span>
            ) : (
              <>
                <RatingSummary
                  rating={listing.ratingAvg}
                  count={listing.reviewCount}
                  className="text-[11px] md:hidden"
                />
                <RatingStars rating={listing.ratingAvg} className="max-md:hidden" />
              </>
            )}
            <span className="shrink-0 text-[10px] md:hidden">
              {t('catalog:completedBookings', { count: listing.completedBookings })}
            </span>
            <span className="shrink-0 text-right max-md:hidden">
              {t('catalog:completedBookings', { count: listing.completedBookings })}
            </span>
          </div>

          <div className="flex shrink-0 items-end justify-end text-right">
            <p className="text-xs leading-4 text-muted-foreground md:text-sm md:leading-5">
              <span className="flex flex-wrap items-baseline justify-end gap-x-2">
                {discountPercent !== null && regularPrice ? (
                  <span className="text-xs text-muted-foreground/65 line-through md:text-base md:leading-6">
                    {regularPrice}
                  </span>
                ) : null}
                <span
                  className={discountPercent !== null ? 'text-brand-accent' : 'text-foreground'}
                >
                  {t('listing:fromPriceShort')}{' '}
                  <strong className="text-base leading-5 font-semibold md:text-lg md:leading-7">
                    {price}
                  </strong>
                </span>
              </span>
              <span
                className={`block ${discountPercent !== null ? 'text-brand-accent' : 'text-muted-foreground'}`}
              >
                {t(priceUnit.key, priceUnit.count === undefined ? {} : { count: priceUnit.count })}
              </span>
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

const PRICE_UNIT_KEYS = {
  hour: 'listing:perHour',
  day: 'listing:perDay',
  item: 'listing:perItem',
  session: 'listing:perSession',
  package: 'listing:perDay',
} as const satisfies Record<EnrichedSearchListing['priceUnit'], string>;

/**
 * What the "from" price is quoted per, most specific first: a chosen date range
 * wins over the listing's own unit, and a chosen time window turns the hourly
 * unit into the actual hour count.
 */
function priceUnitLabel(
  context: SearchResultContext,
  priceUnit: EnrichedSearchListing['priceUnit'],
): {
  key:
    | 'listing:forSelectedDays'
    | 'listing:forHours'
    | (typeof PRICE_UNIT_KEYS)[keyof typeof PRICE_UNIT_KEYS];
  count?: number;
} {
  if (context.hasDailyRange) {
    return { key: 'listing:forSelectedDays', count: context.selectedDayCount };
  }
  if (priceUnit === 'hour' && context.selectedHours) {
    return { key: 'listing:forHours', count: context.selectedHours };
  }
  return { key: PRICE_UNIT_KEYS[priceUnit] };
}

function calculateDiscountPercent(regularPrice: string, salePrice: string): number | null {
  const regular = BigInt(regularPrice);
  const sale = BigInt(salePrice);
  if (regular <= 0n || sale >= regular) return null;

  return Number(((regular - sale) * 100n + regular / 2n) / regular);
}
