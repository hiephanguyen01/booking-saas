import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/shared';
import { attributeSummary, formatVnd } from '../lib/ui';

/** Image-forward listing card (Airbnb-style) used on the home + catalog pages. */
export function ListingCard({ listing }: { listing: PublicListingResponse }) {
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);

  return (
    <Link to={`/l/${listing.slug}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100">
        {cover ? (
          <img
            src={cover}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            {listing.title}
          </div>
        )}
      </div>
      <div className="mt-3 space-y-0.5">
        <h3 className="font-semibold leading-snug transition-colors group-hover:text-(--sf-primary)">
          {listing.title}
        </h3>
        {summary ? <p className="line-clamp-1 text-sm text-(--sf-muted)">{summary}</p> : null}
        {price ? (
          <p className="pt-0.5 text-sm">
            <span className="font-semibold">{price}</span>{' '}
            <span className="text-(--sf-muted)">trở lên</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
