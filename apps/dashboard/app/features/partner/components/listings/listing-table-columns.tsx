import type { ListingResponse, ListingTypeResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Money } from '~/components/money';
import { EnumValue } from '~/components/enum-value';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { dashboardPaths } from '~/constants/paths';
import { listingPriceFrom } from '~/lib/listing-price';
import { ListingRowActions } from './listing-row-actions';
import { ListingSummaryCell } from './listing-summary-cell';
import { ListingVisibilitySwitch } from './listing-visibility-switch';

/** Figma-adapted columns for standalone listings, including optional detail columns. */
export function buildListingColumns(opts: {
  listingTypes: ListingTypeResponse[];
  canWrite: boolean;
  canPublish: boolean;
  canAvailability: boolean;
  /** Ids whose edit is waiting for the tenant — the row shows a "chờ duyệt" chip. */
  pendingChangeIds?: ReadonlySet<string>;
}): DataTableColumn<ListingResponse>[] {
  const { listingTypes, canWrite, canPublish, canAvailability, pendingChangeIds } = opts;
  const typeById = new Map(listingTypes.map((type) => [type.id, type]));

  return [
    {
      id: 'listing',
      header: 'Bài đăng',
      columnLabel: 'Bài đăng',
      enableHiding: false,
      cell: (listing) => (
        <ListingSummaryCell
          href={dashboardPaths.partner.listing(listing.id)}
          title={listing.title}
          photos={listing.photos}
          favoriteCount={listing.favoriteCount}
          ratingAvg={listing.ratingAvg}
          status={listing.status}
          hasPendingChange={pendingChangeIds?.has(listing.id) ?? false}
        />
      ),
      className: 'min-w-[22rem] px-4 py-3',
      headClassName: 'min-w-[22rem] px-4',
    },
    {
      id: 'type',
      header: 'Danh mục',
      columnLabel: 'Danh mục',
      cell: (listing) => (
        <span className="font-medium">{typeById.get(listing.listingTypeId)?.name ?? '—'}</span>
      ),
      className: 'min-w-36 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'bookings',
      header: 'Số đơn đặt',
      columnLabel: 'Số đơn đặt',
      cell: (listing) => <span className="tabular-nums">{listing.bookingCount}</span>,
      className: 'min-w-28 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'visibility',
      header: 'Hiển thị',
      columnLabel: 'Hiển thị',
      enableHiding: false,
      cell: (listing) => (
        <ListingVisibilitySwitch
          id={listing.id}
          target="listing"
          title={listing.title}
          status={listing.status}
          hiddenBy={listing.hiddenBy}
          canPublish={canPublish}
        />
      ),
      className: 'min-w-24 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'status',
      header: 'Trạng thái',
      columnLabel: 'Trạng thái',
      defaultVisible: false,
      cell: (listing) => <ListingStatusBadge status={listing.status} />,
      className: 'min-w-32 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'modes',
      header: 'Hình thức',
      columnLabel: 'Hình thức',
      defaultVisible: false,
      cell: (listing) => (
        <div className="flex min-w-36 flex-wrap gap-1">
          {listing.bookingModes.map((mode) => (
            <Badge key={mode} variant="outline" className="font-normal">
              <EnumValue map={BOOKING_MODE_LABEL} value={mode} />
            </Badge>
          ))}
        </div>
      ),
      className: 'px-4',
      headClassName: 'px-4',
    },
    {
      id: 'price',
      header: 'Giá từ',
      columnLabel: 'Giá từ',
      defaultVisible: false,
      cell: (listing) => {
        const price = listingPriceFrom(listing);
        return price ? <Money value={price} /> : <span className="text-muted-foreground">—</span>;
      },
      className: 'min-w-32 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'updatedAt',
      header: 'Cập nhật',
      columnLabel: 'Cập nhật',
      defaultVisible: false,
      cell: (listing) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(listing.updatedAt)}
        </span>
      ),
      className: 'px-4',
      headClassName: 'px-4',
    },
    {
      id: 'actions',
      header: 'Thao tác',
      enableHiding: false,
      headClassName: 'min-w-28 px-4 text-right',
      className: 'px-4 text-right',
      cell: (listing) => (
        <ListingRowActions
          listing={listing}
          canWrite={canWrite}
          canPublish={canPublish}
          canAvailability={canAvailability}
        />
      ),
    },
  ];
}
