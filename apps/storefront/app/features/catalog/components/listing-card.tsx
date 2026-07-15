import { cn } from '@booking/ui/lib/utils';
import { Heart, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/contracts';
import { attributeSummary, formatListingLocation, formatVnd } from '../../../lib/ui';
import { storefrontPaths } from '../../../lib/locale-paths';
import { useLocale } from '../../../lib/use-locale';

/**
 * Image-forward listing card used on the home + catalog pages. Visual chrome
 * (border, favorite decoration, price row styling) follows the Figma card
 * design. Home may pass deterministic presentation metadata for fields that
 * are not exposed by `PublicListingResponse`; other catalog surfaces remain
 * backed by API data only.
 */
export interface ListingCardPresentation {
  rating: number;
  bookingCount: number;
  discountPercent: number;
  originalPrice: string | null;
  priceUnit: 'giờ' | 'ngày';
}

export function ListingCard({
  listing,
  presentation,
}: {
  listing: PublicListingResponse;
  presentation?: ListingCardPresentation;
}) {
  const locale = useLocale();
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);
  const location = formatListingLocation(listing);

  return (
    <Link
      to={
        listing.kind === 'group'
          ? storefrontPaths.listingGroup(locale, listing.slug)
          : storefrontPaths.listing(locale, listing.slug)
      }
      className="group flex h-full min-h-98.5 flex-col overflow-hidden rounded-lg border-2 border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative h-46 shrink-0 overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={listing.title}
            width={720}
            height={480}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {listing.title}
          </div>
        )}
        {/* Decorative only — no wishlist backend exists yet, so this doesn't persist state. */}
        <span
          aria-hidden
          className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-background/95 text-primary shadow-md"
        >
          <Heart className="size-5" />
        </span>
        {presentation?.discountPercent ? (
          <span className="absolute top-4 left-0 flex h-10 min-w-18 items-center bg-primary px-3 pr-5 text-sm font-semibold text-primary-foreground [clip-path:polygon(0_0,100%_0,82%_50%,100%_100%,0_100%)]">
            - {presentation.discountPercent}%
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-h-18 flex-col gap-2">
          <h3 className="line-clamp-2 text-lg leading-7 font-semibold text-foreground transition-colors group-hover:text-primary">
            {listing.title}
          </h3>
          {location ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          ) : null}
        </div>
        {presentation ? (
          <div className="mt-auto flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className="flex items-center gap-0.5 text-[#f59e0b]"
                aria-label={`${presentation.rating.toFixed(1)} trên 5 sao`}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    aria-hidden="true"
                    className="size-4"
                    fill={index < Math.floor(presentation.rating) ? 'currentColor' : 'none'}
                  />
                ))}
              </span>
              <span className="text-sm text-muted-foreground">
                {presentation.bookingCount} đã đặt
              </span>
            </div>
            {price ? (
              <div className="flex flex-col items-end gap-1 text-sm">
                <div className="flex flex-wrap items-baseline justify-end gap-2">
                  {presentation.originalPrice ? (
                    <span className="text-muted-foreground/65 line-through">
                      {formatVnd(presentation.originalPrice)}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'font-semibold',
                      presentation.discountPercent ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    từ {price}
                  </span>
                </div>
                <span
                  className={cn(
                    presentation.discountPercent ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  cho 1 {presentation.priceUnit}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {summary ? <p className="line-clamp-1 text-sm text-muted-foreground">{summary}</p> : null}
            {price ? (
              <p className="mt-auto text-right text-sm">
                <span className="font-semibold text-primary">từ {price}</span>{' '}
                <span className="text-muted-foreground">trở lên</span>
              </p>
            ) : null}
          </>
        )}
      </div>
    </Link>
  );
}
