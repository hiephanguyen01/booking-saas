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
          {listing.photos[0] ? (
            <img
              src={listing.photos[0]}
              alt={listing.title}
              className="size-12 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="size-12 shrink-0 rounded-md bg-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {canEdit ? (
                <EntityRef
                  to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`}
                  name={listing.title}
                />
              ) : (
                listing.title
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">/{listing.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Hình thức',
      cell: (listing) => (
        <div className="flex flex-wrap gap-1">
          {listing.bookingModes.map((mode) => (
            <Badge key={mode} variant="outline" className="font-normal">
              <EnumValue map={BOOKING_MODE_LABEL} value={mode} />
            </Badge>
          ))}
        </div>
      ),
    },
    { header: 'Trạng thái', cell: (listing) => <ListingStatusBadge status={listing.status} /> },
    { header: 'Giá từ', cell: (listing) => <ChildPrice listing={listing} /> },
    {
      header: 'Cọc / Kho',
      cell: (listing) => (
        <div className="text-sm">
          <span>Cọc {listing.depositPercent}%</span>
          {listing.stockQuantity != null ? (
            <span className="block text-xs text-muted-foreground">
              Kho: {formatNumber(listing.stockQuantity)}
            </span>
          ) : null}
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
        {listing.photos[0] ? (
          <img
            src={listing.photos[0]}
            alt={listing.title}
            className="size-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="size-16 shrink-0 rounded-md bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">
              {canEdit ? (
                <EntityRef
                  to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`}
                  name={listing.title}
                />
              ) : (
                listing.title
              )}
            </p>
            <ListingStatusBadge status={listing.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">/{listing.slug}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {listing.bookingModes.map((mode) => (
              <Badge key={mode} variant="outline" className="font-normal">
                <EnumValue map={BOOKING_MODE_LABEL} value={mode} />
              </Badge>
            ))}
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
          <span>Cọc {listing.depositPercent}%</span>
          {listing.stockQuantity != null ? (
            <span className="block text-xs text-muted-foreground">
              Kho: {formatNumber(listing.stockQuantity)}
            </span>
          ) : null}
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
