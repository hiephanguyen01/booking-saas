import type { ListingResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Money } from '~/components/money';
import { EnumValue } from '~/components/enum-value';
import { EntityRef } from '~/components/entity-ref';
import { EffectiveCancellationPolicyCell } from '~/components/cancellation-tiers';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatNumber } from '~/lib/format';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { listingPriceFrom } from '~/lib/listing-price';
import { GroupedListingActions } from './grouped-listing-actions';

/** A child's price (Money) or the muted "Chưa có giá" when none is configured. */
export function ChildPrice({ listing }: { listing: ListingResponse }) {
  const price = listingPriceFrom(listing);
  return price ? (
    <Money value={price} />
  ) : (
    <span className="text-muted-foreground">Chưa có giá</span>
  );
}

/** Thumbnail or muted placeholder for a child listing; `sizeClassName` differs desktop/mobile. */
function ChildThumbnail({ listing, sizeClassName }: { listing: ListingResponse; sizeClassName: string }) {
  return listing.photos[0] ? (
    <img
      src={listing.photos[0]}
      alt={listing.title}
      className={`${sizeClassName} shrink-0 rounded-md object-cover`}
    />
  ) : (
    <div className={`${sizeClassName} shrink-0 rounded-md bg-muted`} />
  );
}

/** The child's title — a link when the caller can edit it, plain text otherwise. */
function ChildTitleLink({
  groupId,
  listing,
  canEdit,
}: {
  groupId: string;
  listing: ListingResponse;
  canEdit: boolean;
}) {
  return canEdit ? (
    <EntityRef
      to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`}
      name={listing.title}
    />
  ) : (
    <>{listing.title}</>
  );
}

/** The `/slug` line under a child's title (identical on the table row and the mobile card). */
function ChildSlugLine({ slug }: { slug: string }) {
  return <p className="truncate text-xs text-muted-foreground">/{slug}</p>;
}

/** Booking-mode badges for a child listing (caller supplies the wrapping div + className). */
function ChildModeBadges({ modes }: { modes: ListingResponse['bookingModes'] }) {
  return (
    <>
      {modes.map((mode) => (
        <Badge key={mode} variant="outline" className="font-normal">
          <EnumValue map={BOOKING_MODE_LABEL} value={mode} />
        </Badge>
      ))}
    </>
  );
}

/** "Cọc X% / Kho: N" — caller supplies the wrapping div + className. */
function ChildDepositStock({ listing }: { listing: ListingResponse }) {
  return (
    <>
      <span>Cọc {listing.depositPercent}%</span>
      {listing.stockQuantity != null ? (
        <span className="block text-xs text-muted-foreground">
          Kho: {formatNumber(listing.stockQuantity)}
        </span>
      ) : null}
    </>
  );
}

/** Desktop table columns for the group's child listings. */
export function buildGroupedListingColumns(opts: {
  groupId: string;
  itemLabel: string;
  canEdit: boolean;
  canWrite: boolean;
  canAvailability: boolean;
}): DataTableColumn<ListingResponse>[] {
  const { groupId, itemLabel, canEdit, canWrite, canAvailability } = opts;
  return [
    {
      header: itemLabel,
      cell: (listing) => (
        <div className="flex min-w-0 items-center gap-3">
          <ChildThumbnail listing={listing} sizeClassName="size-12" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              <ChildTitleLink groupId={groupId} listing={listing} canEdit={canEdit} />
            </p>
            <ChildSlugLine slug={listing.slug} />
          </div>
        </div>
      ),
    },
    {
      header: 'Hình thức',
      cell: (listing) => (
        <div className="flex flex-wrap gap-1">
          <ChildModeBadges modes={listing.bookingModes} />
        </div>
      ),
    },
    { header: 'Trạng thái', cell: (listing) => <ListingStatusBadge status={listing.status} /> },
    { header: 'Giá từ', cell: (listing) => <ChildPrice listing={listing} /> },
    {
      header: 'Cọc / Kho',
      cell: (listing) => (
        <div className="text-sm">
          <ChildDepositStock listing={listing} />
        </div>
      ),
    },
    {
      header: 'Chính sách huỷ',
      cell: (listing) => (
        <EffectiveCancellationPolicyCell
          policy={listing.effectiveCancellationPolicy}
          source={listing.effectiveCancellationPolicySource}
        />
      ),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      headClassName: 'text-right',
      cell: (listing) => (
        <GroupedListingActions
          groupId={groupId}
          listing={listing}
          itemLabel={itemLabel}
          canEdit={canEdit}
          canManageCalendar={canWrite || canAvailability}
        />
      ),
    },
  ];
}

/** Mobile card rendering of one child listing (same content as a table row). */
export function GroupedListingCard({
  groupId,
  listing,
  itemLabel,
  canEdit,
  canManageCalendar,
}: {
  groupId: string;
  listing: ListingResponse;
  itemLabel: string;
  canEdit: boolean;
  canManageCalendar: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 gap-3">
        <ChildThumbnail listing={listing} sizeClassName="size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">
              <ChildTitleLink groupId={groupId} listing={listing} canEdit={canEdit} />
            </p>
            <ListingStatusBadge status={listing.status} />
          </div>
          <ChildSlugLine slug={listing.slug} />
          <div className="mt-2 flex flex-wrap gap-1">
            <ChildModeBadges modes={listing.bookingModes} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Giá từ</p>
          <p className="text-sm font-medium">
            <ChildPrice listing={listing} />
          </p>
        </div>
        <div className="text-right text-sm">
          <ChildDepositStock listing={listing} />
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Chính sách huỷ</p>
        <EffectiveCancellationPolicyCell
          policy={listing.effectiveCancellationPolicy}
          source={listing.effectiveCancellationPolicySource}
        />
      </div>
      <GroupedListingActions
        groupId={groupId}
        listing={listing}
        itemLabel={itemLabel}
        canEdit={canEdit}
        canManageCalendar={canManageCalendar}
      />
    </div>
  );
}
