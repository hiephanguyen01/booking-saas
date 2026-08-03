import type { ListingResponse } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { Badge } from '@booking/ui/components/ui/badge';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { listingPriceFrom } from '~/lib/listing-price';
import { Money } from '~/components/money';
import { EntityRef } from '~/components/entity-ref';
import { ListingStatusBadge } from '~/components/status-badge';
import { dashboardPaths } from '~/constants/paths';

/** One child item of a listing group on the group review page. */
export function ChildListingCard({ listing }: { listing: ListingResponse }) {
  const price = listingPriceFrom(listing);
  const thumb = listing.photos[0];
  return (
    <div className="flex gap-3 rounded-lg border border-border p-3">
      {thumb ? (
        <a
          href={thumb}
          target="_blank"
          rel="noreferrer"
          className="block size-16 shrink-0 overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src={thumb}
            alt={listing.title}
            className="size-full object-cover"
          />
        </a>
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          Ảnh
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-medium">{listing.title}</p>
          <ListingStatusBadge status={listing.status} />
        </div>
        <div className="flex flex-wrap gap-1">
          {listing.bookingModes.map((mode) => (
            <Badge key={mode} variant="outline" className="font-normal">
              {BOOKING_MODE_LABEL[mode]}
            </Badge>
          ))}
        </div>
        <p className="text-sm">
          <span className="text-muted-foreground">Giá từ </span>
          {price ? <Money value={price} /> : <span className="text-muted-foreground">—</span>}
        </p>
        <EntityRef
          to={dashboardPaths.tenant.listingReview(listing.id)}
          name="Xem chi tiết & kiểm duyệt"
          className="text-sm"
        />
      </div>
    </div>
  );
}
