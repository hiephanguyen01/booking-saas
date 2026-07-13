import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/shared';
import { attributeSummary, formatVnd } from '../lib/ui';

/** Image-forward listing card (Airbnb-style) used on the home + catalog pages. */
export function ListingCard({ listing }: { listing: PublicListingResponse }) {
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);

  return (
    <Link
      to={`/l/${listing.slug}`}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {listing.title}
          </div>
        )}
      </div>
      <div className="mt-3 space-y-0.5">
        <h3 className="font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {listing.title}
        </h3>
        {summary ? <p className="line-clamp-1 text-sm text-muted-foreground">{summary}</p> : null}
        {price ? (
          <p className="pt-0.5 text-sm">
            <span className="font-semibold text-foreground">{price}</span>{' '}
            <span className="text-muted-foreground">trở lên</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
