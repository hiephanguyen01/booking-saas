import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { Image } from '@booking/ui/components/media/image';
import { RatingStars } from '~/components/rating-stars';
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
    // `md:grid-rows-1` is load-bearing: without an explicit row the implicit one
    // is content-sized, so the photo below never had a definite height to
    // resolve its `h-full` against and sized itself from its own aspect ratio
    // instead. A 4:3 source happened to land on this card's 184px, which is why
    // only portrait uploads broke out of the card.
    <article className="group relative grid overflow-hidden bg-card transition-[border-color,box-shadow] rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] shadow-(--sf-surface-shadow) hover:border-primary/50 md:h-46 md:grid-cols-[248px_120px_minmax(0,1fr)] md:grid-rows-1 md:gap-x-1.5">
      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          // `after:-inset-1.5` extends the 32px chip to a 44px tap target while
          // the visible circle keeps the size the card layout is built around.
          className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-background text-primary shadow-md transition-transform after:absolute after:-inset-1.5 after:content-[''] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:top-6 md:right-auto md:left-[310px] md:size-10"
        >
          <Heart
            className="size-4 md:size-5"
            fill={favoriteControl.selected ? 'currentColor' : 'none'}
          />
        </button>
      ) : null}
      <Link
        to={href}
        // `h-52`, not `min-h-52`: a min-height is not a definite height, so the
        // image inside could not resolve `h-full` on the stacked layout either.
        className="relative h-52 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-full"
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
      </Link>

      <div className="relative hidden grid-rows-2 gap-1.5 bg-muted md:grid">
        {[photos[1], photos[2]].map((photo, index) => (
          <div key={photo ?? index} className="min-h-0 overflow-hidden bg-muted">
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

      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-4 md:pr-6 md:pl-[18px]">
        <div className="min-w-0">
          <Link
            to={href}
            className="block truncate text-lg leading-7 font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {listing.title}
          </Link>
          {location ? (
            <p className="mt-1 flex items-center gap-2 text-sm leading-5 text-muted-foreground">
              <MapPin className="size-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 text-sm leading-5 text-muted-foreground">
          {listing.ratingAvg === null || listing.reviewCount === 0 ? (
            <span>{t('catalog:noReviews')}</span>
          ) : (
            <RatingStars rating={listing.ratingAvg} />
          )}
          <span className="shrink-0 text-right">
            {t('catalog:completedBookings', { count: listing.completedBookings })}
          </span>
        </div>

        <div className="flex items-end justify-end text-right">
          <p className="text-sm leading-5 text-muted-foreground">
            <span className="flex flex-wrap items-baseline justify-end gap-x-2">
              {discountPercent !== null && regularPrice ? (
                <span className="text-base leading-6 text-muted-foreground/65 line-through">
                  {regularPrice}
                </span>
              ) : null}
              <span className={discountPercent !== null ? 'text-brand-accent' : 'text-foreground'}>
                {t('listing:fromPriceShort')}{' '}
                <strong className="text-lg leading-7 font-semibold">{price}</strong>
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
