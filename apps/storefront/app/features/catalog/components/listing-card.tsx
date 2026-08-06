import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { cn } from '@booking/ui/lib/utils';
import { Heart, MapPin, X } from 'lucide-react';
import { Link } from 'react-router';
import { DiscountBadge } from '~/components/discount-badge';
import { RatingStars } from '~/components/rating-stars';
import { storefrontPaths } from '~/constants/paths';
import type {
  ListingCardDismissControl,
  ListingCardLayout,
  ListingCardPresentation,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { useLocale } from '~/hooks/use-locale';
import { attributeSummary, formatListingLocation, formatVnd } from '~/lib/ui';

/**
 * Image-forward listing card used on the home + catalog pages.
 *
 * The default Home/catalog rendering only uses `PublicListingResponse`.
 * Optional presentation metadata exists only for callers that have explicit
 * real values; the card never derives business data from a listing id.
 *
 * ## Why this card is a `@container`
 *
 * On one 390px phone the home rail shows two cards at ~165px each *while* the
 * catalog page shows one card at ~358px. A `sm:` breakpoint cannot tell those
 * apart — shrinking the type for the rail would shrink the catalog card with it.
 * A prop cannot either: the same rail instance must be compact on mobile and
 * comfortable at `lg`. The card's own width is the only signal that separates
 * them, so the `@max-[220px]:` variants below compact the card whenever it is
 * *rendered* narrow, no matter who rendered it. Every pre-existing caller is
 * wider than 220px and therefore renders exactly as it did before.
 */
export function ListingCard({
  listing,
  className = '',
  favoriteControl,
  dismissControl,
  presentation,
  layout = 'stacked',
}: {
  listing: PublicListingResponse;
  className?: string;
  favoriteControl?: ListingFavoriteControl;
  dismissControl?: ListingCardDismissControl;
  presentation?: ListingCardPresentation;
  /**
   * `responsive-row` puts the photo to the left of the text below `sm` and falls
   * back to the stacked layout from `sm:` up — one DOM tree, so one link, one
   * heart and one `useFavorite` subscription. Only the home page's recommended
   * grid asks for it.
   */
  layout?: ListingCardLayout;
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
  const chipLayout = isRow ? 'row' : 'stacked';

  const originalPrice = presentation?.originalPrice ? formatVnd(presentation.originalPrice) : null;

  return (
    <article
      className={cn(
        'group/card @container relative flex h-full flex-col overflow-hidden bg-card rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] shadow-(--sf-surface-shadow)',
        isRow ? 'min-h-0 sm:min-h-80' : 'min-h-80 @max-[220px]:min-h-64',
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
          isRow ? 'flex-row sm:flex-col' : 'flex-col',
        )}
      >
        <div
          className={cn(
            'relative shrink-0 overflow-hidden bg-muted',
            isRow ? 'h-28 w-28 sm:h-46 sm:w-auto' : 'h-46 @max-[220px]:h-32',
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
          {presentation?.discountPercent ? (
            <DiscountBadge percent={presentation.discountPercent} />
          ) : null}
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-3 p-4 @max-[220px]:gap-2 @max-[220px]:p-2.5',
            isRow && 'sm:min-w-0',
          )}
        >
          <div className="flex flex-col gap-2 @max-[220px]:gap-1.5">
            <h3
              className={cn(
                'line-clamp-2 text-lg leading-7 font-semibold text-foreground transition-colors group-hover:text-primary @max-[220px]:text-sm @max-[220px]:leading-5',
                isRow && 'pr-9 text-base sm:pr-0 sm:text-lg',
              )}
            >
              {listing.title}
            </h3>
            {location ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground @max-[220px]:gap-1 @max-[220px]:text-xs">
                <MapPin className="size-4 shrink-0 @max-[220px]:size-3.5" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </p>
            ) : null}
            {presentation?.distanceMeters !== undefined ? (
              <p className="text-xs font-medium text-primary">
                {formatDistance(presentation.distanceMeters, locale)}
              </p>
            ) : null}
          </div>
          {rating !== null && ratingCount > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground @max-[220px]:flex-col @max-[220px]:items-start @max-[220px]:gap-1 @max-[220px]:text-xs">
              <RatingStars rating={rating} />
              <span>
                {rating.toFixed(1)} · {t('reviewCount', { count: ratingCount })}
              </span>
            </div>
          ) : summary ? (
            <p className="line-clamp-1 text-sm text-muted-foreground @max-[220px]:text-xs">
              {summary}
            </p>
          ) : null}
          {price && presentation ? (
            <div
              className={cn(
                'mt-auto text-right text-sm @max-[220px]:text-xs',
                isRow && 'text-left sm:text-right',
              )}
            >
              <p>
                {originalPrice ? (
                  <span className="mr-2 text-muted-foreground line-through">{originalPrice}</span>
                ) : null}
                <span
                  className={
                    presentation?.discountPercent ? 'text-brand-accent' : 'text-foreground'
                  }
                >
                  <span className="font-normal">{t('fromPriceShort')} </span>
                  <span className="text-base font-semibold @max-[220px]:text-sm">{price}</span>
                </span>
              </p>
              <p
                className={`mt-1 ${
                  presentation?.discountPercent ? 'text-brand-accent' : 'text-muted-foreground'
                }`}
              >
                {presentation?.priceUnit
                  ? t(`priceUnit.${presentation.priceUnit}`)
                  : t('fromPrice')}
              </p>
            </div>
          ) : price ? (
            <p
              className={cn(
                'mt-auto text-right text-sm @max-[220px]:text-xs',
                isRow && 'text-left sm:text-right',
              )}
            >
              <span className="font-semibold text-primary">
                {t('fromPriceShort')} {price}
              </span>{' '}
              <span className="text-muted-foreground">{t('fromPrice')}</span>
            </p>
          ) : null}
        </div>
      </Link>
      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          className={cn(CHIP_CLASS, 'text-primary', CHIP_PLACEMENT.right[chipLayout])}
        >
          <Heart
            className="size-5 @max-[220px]:size-4"
            fill={favoriteControl.selected ? 'currentColor' : 'none'}
          />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className={cn(CHIP_CLASS, 'text-primary', CHIP_PLACEMENT.right[chipLayout])}
        >
          <Heart className="size-5 @max-[220px]:size-4" />
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
const CHIP_CLASS =
  "absolute z-10 flex items-center justify-center rounded-full bg-background/95 shadow-md transition-transform after:absolute after:-inset-0.5 after:content-[''] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const CHIP_PLACEMENT = {
  right: {
    stacked: 'right-4 top-4 size-10 @max-[220px]:size-8',
    row: 'right-2 top-2 size-9 sm:right-4 sm:top-4 sm:size-10',
  },
  left: {
    stacked: 'left-4 top-4 size-10 @max-[220px]:size-8',
    row: 'left-2 top-2 size-9 sm:left-4 sm:top-4 sm:size-10',
  },
} as const;

function formatDistance(distanceMeters: number, locale: string): string {
  if (distanceMeters < 1_000) return `${distanceMeters.toLocaleString(locale)} m`;
  return `${(distanceMeters / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
}
