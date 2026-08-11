import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { cn } from '@booking/ui/lib/utils';
import { Heart, MapPin, X } from 'lucide-react';
import { Link } from 'react-router';
import { DiscountBadge } from '~/components/discount-badge';
import { RatingStars, RatingSummary } from '~/components/rating-stars';
import { storefrontPaths } from '~/constants/paths';
import { SURFACE_FRAME } from '~/constants/surfaces';
import type {
  ListingCardDismissControl,
  ListingCardLayout,
  ListingCardPresentation,
  ListingCardVariant,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { useLocale } from '~/hooks/use-locale';
import { attributeSummary, formatListingLocation, formatVnd } from '~/lib/ui';

/**
 * Image-forward listing card used on every listing surface — the home rails and
 * recommended grid, the provider profile, related rails, favourites and
 * recently-viewed.
 *
 * The default Home/catalog rendering only uses `PublicListingResponse`.
 * Optional presentation metadata exists only for callers that have explicit
 * real values; the card never derives business data from a listing id.
 *
 * ## Two layouts, and why `responsive-row` is the default
 *
 * `responsive-row` is a compact row below `sm` (photo left, text right) and the
 * stacked card from `sm:` up. Every vertical list of listings uses it, because a
 * stacked card on a phone spends ~350px per result and shows two of them per
 * screen. The rails opt out with `stacked`: a carousel slide is ~165px wide, and
 * a row inside it would leave a 55px photo beside a 100px text column.
 *
 * ## Why this card is a `@container`
 *
 * On one 390px phone the home rail shows two cards at ~165px each *while* the
 * catalog page shows one card at ~358px. A `sm:` breakpoint cannot tell those
 * apart — shrinking the type for the rail would shrink the catalog card with it.
 * A prop cannot either: the same rail instance must be compact on mobile and
 * comfortable at `lg`. The card's own width is the only signal that separates
 * them, so the `@max-[220px]:` variants below compact the card whenever it is
 * *rendered* narrow, no matter who rendered it.
 *
 * Those variants live on the card's *children*, never on the `<article>` that
 * declares `@container`: an element cannot query its own size, so an
 * `@max-[220px]:` utility on the article itself silently never matches. That is
 * why the card's height is set on the `<Link>` and not on the article.
 */
export function ListingCard({
  listing,
  className = '',
  favoriteControl,
  dismissControl,
  presentation,
  layout = 'responsive-row',
  variant = 'default',
}: {
  listing: PublicListingResponse;
  className?: string;
  favoriteControl?: ListingFavoriteControl;
  dismissControl?: ListingCardDismissControl;
  presentation?: ListingCardPresentation;
  layout?: ListingCardLayout;
  variant?: ListingCardVariant;
}) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Listing);
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);
  const location = formatListingLocation(listing);
  const rating = listing.ratingAvg;
  const ratingCount = listing.reviewCount;
  const isRow = layout === 'responsive-row';
  const isDiscovery = variant === 'discovery';
  const chipLayout = isRow ? 'row' : 'stacked';
  const hasDiscount = presentation?.discountPercent != null;

  const originalPrice = presentation?.originalPrice ? formatVnd(presentation.originalPrice) : null;

  const meta = isDiscovery ? (
    <DiscoveryListingMeta
      rating={rating}
      ratingCount={ratingCount}
      completedBookings={presentation?.completedBookings}
    />
  ) : rating !== null && ratingCount > 0 ? (
      <ListingRating rating={rating} count={ratingCount} row={isRow} />
    ) : summary ? (
      <p
        className={cn(
          'line-clamp-1 text-muted-foreground',
          isRow ? 'min-w-0 text-xs sm:text-sm' : 'text-sm @max-[220px]:text-xs',
        )}
      >
        {summary}
      </p>
    ) : null;

  const priceNode =
    price && presentation ? (
      // Left-aligned once the card is a column: the old right rail put the price
      // as far as it could get from the title it belongs to, and on a 172px cell
      // that is the full width of the card.
      <div
        className={cn(
          isRow
            ? 'shrink-0 text-right text-xs sm:text-sm'
            : 'mt-auto text-sm @max-[220px]:text-xs',
          isDiscovery && 'text-right',
        )}
      >
        <p
          className={cn(
            'flex flex-wrap items-baseline gap-x-1.5',
            isRow || isDiscovery ? 'justify-end' : 'justify-start',
          )}
        >
          {hasDiscount && originalPrice ? (
            <span className="text-muted-foreground line-through">{originalPrice}</span>
          ) : null}
          <span
            className={hasDiscount ? 'text-brand-accent' : 'text-foreground'}
          >
            <span className="font-normal">{t('fromPriceShort')} </span>
            <span
              className={cn(
                'font-bold',
                isRow ? 'text-sm sm:text-base' : 'text-base @max-[220px]:text-sm',
              )}
            >
              {price}
            </span>
          </span>
        </p>
        <p
          className={cn(
            'mt-0.5 text-xs',
            hasDiscount ? 'text-brand-accent' : 'text-muted-foreground',
          )}
        >
          {presentation?.priceUnit ? t(`priceUnit.${presentation.priceUnit}`) : t('fromPrice')}
        </p>
      </div>
    ) : price ? (
      <p
        className={cn(
          isRow ? 'shrink-0 text-right text-xs sm:text-sm' : 'mt-auto text-sm @max-[220px]:text-xs',
        )}
      >
        <span className="font-bold text-primary">
          {t('fromPriceShort')} {price}
        </span>{' '}
        <span className="text-xs text-muted-foreground">{t('fromPrice')}</span>
      </p>
    ) : null;

  return (
    <article
      className={cn(
        SURFACE_FRAME,
        'group/card @container relative flex h-full flex-col overflow-hidden bg-card',
        className,
      )}
    >
      <Link
        to={
          listing.kind === 'group'
            ? storefrontPaths.listingGroup(locale, listing.slug)
            : storefrontPaths.listing(locale, listing.slug)
        }
        className={cn(
          'group flex h-full flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          // The card's height lives here rather than on the `@container`
          // article, which cannot answer a query about its own width.
          // `min-h-30` is what a two-line title, a location and the price line
          // actually need; before this the row was whatever its text came to and
          // a rated card stood 52px taller than an unrated one beside it.
          isDiscovery
            ? 'h-[calc(24.625rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] min-h-[calc(24.625rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] flex-col @max-[220px]:h-[calc(18rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] @max-[220px]:min-h-[calc(18rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] @max-[190px]:h-[calc(16rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] @max-[190px]:min-h-[calc(16rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))]'
            : isRow
            ? 'min-h-30 flex-row sm:min-h-76 sm:flex-col'
            : 'min-h-72 flex-col @max-[220px]:min-h-64 @max-[190px]:min-h-60',
        )}
      >
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-(--sf-image-radius) bg-muted sm:rounded-none',
            // No height on the row photo on purpose: as a flex child it stretches
            // to the row, so the photo is always exactly as tall as the card
            // instead of leaving a strip of empty card under it.
            //
            // Three photo heights, one per width the card actually gets rendered
            // at: a full-width column, a ~208px rail slide, and a ~172px cell of
            // the two-up recommendation grid.
            isDiscovery
              ? 'h-46 @max-[220px]:h-34 @max-[190px]:h-28'
              : isRow
                ? 'w-28 sm:h-40 sm:w-auto'
                : 'h-40 @max-[220px]:h-34 @max-[190px]:h-28',
          )}
        >
          {cover ? (
            <Image
              src={cover}
              alt={listing.title}
              width={720}
              height={480}
              className="h-full w-full object-cover object-top transition duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center text-sm text-muted-foreground @max-[220px]:text-xs">
              {listing.title}
            </div>
          )}
          {presentation?.discountPercent != null ? (
            <DiscountBadge
              percent={presentation.discountPercent}
              className={
                isDiscovery
                  ? 'top-5 h-10 w-18 text-base font-semibold sm:h-10 sm:w-18 sm:text-base @max-[220px]:top-2.5 @max-[220px]:h-6 @max-[220px]:w-14 @max-[220px]:text-xs'
                  : undefined
              }
            />
          ) : null}
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col',
            isDiscovery
              ? 'gap-3 p-(--sf-surface-pad) @max-[220px]:gap-2'
              : isRow
              ? 'gap-1 p-(--sf-surface-pad) sm:gap-2.5 sm:p-3.5'
              : 'gap-2.5 p-(--sf-surface-pad) sm:p-3.5 @max-[220px]:gap-2',
          )}
        >
          <div
            className={cn(
              'flex flex-col',
              isDiscovery
                ? 'gap-2 @max-[220px]:gap-1'
                : isRow
                  ? 'gap-0.5 sm:gap-1.5'
                  : 'gap-1.5 @max-[220px]:gap-1',
            )}
          >
            <h3
              className={cn(
                'line-clamp-2 text-foreground transition-colors group-hover:text-primary',
                isDiscovery
                  ? 'text-lg leading-7 font-semibold @max-[220px]:text-sm @max-[220px]:leading-5'
                  : isRow
                  ? 'pr-9 text-base leading-5 font-bold sm:pr-0 sm:text-base sm:leading-6'
                  : 'text-base leading-6 font-bold @max-[220px]:text-sm @max-[220px]:leading-5',
              )}
            >
              {listing.title}
            </h3>
            {location ? (
              <p
                className={cn(
                  'flex items-center text-muted-foreground',
                  isDiscovery
                    ? 'gap-1 text-sm leading-5 @max-[220px]:text-xs'
                    : isRow
                    ? 'gap-1 text-xs sm:gap-1.5 sm:text-sm'
                    : 'gap-1.5 text-sm @max-[220px]:gap-1 @max-[220px]:text-xs',
                )}
              >
                <MapPin
                  className={cn(
                    'shrink-0',
                    isDiscovery
                      ? 'size-5 @max-[220px]:size-3'
                      : isRow
                        ? 'size-3.5 sm:size-4'
                        : 'size-4 @max-[220px]:size-3',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{location}</span>
              </p>
            ) : null}
            {presentation?.distanceMeters !== undefined ? (
              <p className="text-xs font-medium text-primary">
                {formatDistance(presentation.distanceMeters, locale)}
              </p>
            ) : null}
          </div>
          {isRow && !isDiscovery ? (
            // Rating and price share one line on the row, and go back to two
            // stacked blocks from `sm:` up where the card is a column again.
            // Two rows here is what a rated card paid 52px for.
            <div className="mt-auto flex items-end justify-between gap-2 sm:mt-3 sm:flex-col sm:items-stretch sm:gap-3">
              {meta}
              {priceNode}
            </div>
          ) : (
            <>
              {meta}
              {priceNode}
            </>
          )}
        </div>
      </Link>
      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          className={cn(
            CHIP_CLASS,
            'text-primary',
            isDiscovery ? DISCOVERY_CHIP_PLACEMENT : CHIP_PLACEMENT.right[chipLayout],
          )}
        >
          <Heart
            className="size-4.5 @max-[220px]:size-4"
            fill={favoriteControl.selected ? 'currentColor' : 'none'}
          />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            CHIP_CLASS,
            'text-primary',
            isDiscovery ? DISCOVERY_CHIP_PLACEMENT : CHIP_PLACEMENT.right[chipLayout],
          )}
        >
          <Heart className="size-4.5 @max-[220px]:size-4" />
        </span>
      )}
      {dismissControl ? (
        <button
          type="button"
          aria-label={dismissControl.label}
          onClick={dismissControl.onDismiss}
          className={cn(
            CHIP_CLASS,
            'text-muted-foreground hover:text-foreground',
            CHIP_PLACEMENT.left[chipLayout],
          )}
        >
          <X className="size-5 @max-[220px]:size-4" />
        </button>
      ) : null}
    </article>
  );
}

function DiscoveryListingMeta({
  rating,
  ratingCount,
  completedBookings,
}: {
  rating: number | null;
  ratingCount: number;
  completedBookings?: number;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const hasRating = rating !== null && ratingCount > 0;
  if (!hasRating && completedBookings === undefined) return null;

  return (
    <div className="flex min-h-5 items-center justify-between gap-2 text-sm leading-5 text-muted-foreground @max-[220px]:text-xs">
      {hasRating ? (
        <>
          <RatingStars rating={rating} className="@max-[220px]:hidden" />
          <RatingSummary
            rating={rating}
            count={ratingCount}
            className="hidden @max-[220px]:inline-flex"
          />
        </>
      ) : (
        <span aria-hidden="true" />
      )}
      {completedBookings !== undefined ? (
        <span className="shrink-0 text-right tabular-nums">
          {t('bookedCount', { count: completedBookings })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The full five-star block, and — for the row layout below `sm`, where it shares
 * a line with the price — the compact summary instead. Both spellings sit in the
 * tree and CSS picks one, because the layout that decides is a viewport
 * breakpoint and only CSS knows the viewport.
 */
function ListingRating({ rating, count, row }: { rating: number; count: number; row: boolean }) {
  const { t } = useTranslation(NsI18n.Listing);
  const full = (
    <div
      className={cn(
        'items-center justify-between gap-2 text-sm text-muted-foreground',
        // Five stars plus the score and the count need ~165px, which is more than
        // a rail slide or a two-up grid cell has — so under 220px the compact
        // summary takes over instead of the block wrapping or overflowing.
        row ? 'hidden sm:flex' : 'flex @max-[220px]:hidden',
      )}
    >
      <RatingStars rating={rating} />
      <span className="shrink-0 tabular-nums">
        {rating.toFixed(1)} · {t('reviewCount', { count })}
      </span>
    </div>
  );

  return (
    <>
      <RatingSummary
        rating={rating}
        count={count}
        className={cn(
          'text-xs text-muted-foreground',
          row ? 'sm:hidden' : 'hidden @max-[220px]:inline-flex',
        )}
      />
      {full}
    </>
  );
}

const CHIP_CLASS =
  "absolute z-10 flex items-center justify-center rounded-full bg-background/95 shadow-md transition-transform after:absolute after:-inset-0.5 after:content-[''] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const CHIP_PLACEMENT = {
  right: {
    stacked: 'right-2.5 top-2.5 size-9 @max-[220px]:size-8',
    row: 'right-2 top-2 size-9 sm:right-2.5 sm:top-2.5',
  },
  left: {
    stacked: 'left-2.5 top-2.5 size-9 @max-[220px]:size-8',
    row: 'left-2 top-2 size-9 sm:left-2.5 sm:top-2.5',
  },
} as const;

const DISCOVERY_CHIP_PLACEMENT =
  'right-5 top-5 size-10 @max-[220px]:right-2.5 @max-[220px]:top-2.5 @max-[220px]:size-8';

function formatDistance(distanceMeters: number, locale: string): string {
  if (distanceMeters < 1_000) return `${distanceMeters.toLocaleString(locale)} m`;
  return `${(distanceMeters / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
}
