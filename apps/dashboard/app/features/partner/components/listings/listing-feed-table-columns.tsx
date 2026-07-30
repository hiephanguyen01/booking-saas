import type { ListingTypeResponse, PartnerListingFeedItemResponse } from '@booking/contracts';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ListingStatusBadge } from '~/components/status-badge';
import { dashboardPaths } from '~/constants/paths';
import { formatDate } from '~/lib/format';
import { ListingGroupRowActions } from './listing-group-row-actions';
import { ListingRowActions } from './listing-row-actions';
import { ListingSummaryCell } from './listing-summary-cell';
import { ListingVisibilitySwitch } from './listing-visibility-switch';

/** Common columns for the mixed standalone/grouped partner management feed. */
export function buildListingFeedColumns(opts: {
  listingTypes: ListingTypeResponse[];
  canWrite: boolean;
  canPublish: boolean;
  canAvailability: boolean;
  /** Listing/post ids with an edit waiting for the tenant. */
  pendingChangeIds?: ReadonlySet<string>;
}): DataTableColumn<PartnerListingFeedItemResponse>[] {
  const typeById = new Map(opts.listingTypes.map((type) => [type.id, type]));

  return [
    {
      id: 'listing',
      header: 'Bài đăng',
      columnLabel: 'Bài đăng',
      enableHiding: false,
      cell: ({ kind, item }) => (
        <ListingSummaryCell
          href={
            kind === 'single'
              ? dashboardPaths.partner.listing(item.id)
              : dashboardPaths.partner.listingGroup(item.id)
          }
          title={item.title}
          photos={item.photos}
          favoriteCount={item.favoriteCount}
          ratingAvg={item.ratingAvg}
          status={item.status}
          hasPendingChange={opts.pendingChangeIds?.has(item.id) ?? false}
        />
      ),
      className: 'min-w-[22rem] px-4 py-3',
      headClassName: 'min-w-[22rem] px-4',
    },
    {
      id: 'type',
      header: 'Danh mục',
      columnLabel: 'Danh mục',
      cell: ({ item }) => <span className="font-medium">{typeById.get(item.listingTypeId)?.name ?? '—'}</span>,
      className: 'min-w-36 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'bookings',
      header: 'Số đơn đặt',
      columnLabel: 'Số đơn đặt',
      cell: ({ item }) => <span className="tabular-nums">{item.bookingCount}</span>,
      className: 'min-w-28 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'visibility',
      header: 'Hiển thị',
      columnLabel: 'Hiển thị',
      enableHiding: false,
      cell: ({ kind, item }) => (
        <ListingVisibilitySwitch
          id={item.id}
          target={kind === 'single' ? 'listing' : 'group'}
          title={item.title}
          status={item.status}
          hiddenBy={item.hiddenBy}
          canPublish={opts.canPublish}
        />
      ),
      className: 'min-w-24 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'items',
      header: 'Hạng mục',
      columnLabel: 'Hạng mục',
      defaultVisible: false,
      cell: ({ kind, item }) => {
        if (kind === 'single') return <span className="text-muted-foreground">—</span>;
        const itemLabel = typeById.get(item.listingTypeId)?.itemLabel || 'hạng mục';
        return (
          <span className="whitespace-nowrap">
            {item.listingCount} {itemLabel}
            <span className="text-muted-foreground"> · {item.readyListingCount} sẵn sàng</span>
          </span>
        );
      },
      className: 'px-4',
      headClassName: 'px-4',
    },
    {
      id: 'status',
      header: 'Trạng thái',
      columnLabel: 'Trạng thái',
      defaultVisible: false,
      cell: ({ item }) => <ListingStatusBadge status={item.status} />,
      className: 'min-w-32 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'updatedAt',
      header: 'Cập nhật',
      columnLabel: 'Cập nhật',
      defaultVisible: false,
      cell: ({ item }) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDate(item.updatedAt)}</span>
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
      cell: ({ kind, item }) =>
        kind === 'single' ? (
          <ListingRowActions
            listing={item}
            canWrite={opts.canWrite}
            canPublish={opts.canPublish}
            canAvailability={opts.canAvailability}
          />
        ) : (
          <ListingGroupRowActions
            group={item}
            canWrite={opts.canWrite}
            canPublish={opts.canPublish}
          />
        ),
    },
  ];
}
