import type { ListingGroupResponse, ListingTypeResponse } from '@booking/contracts';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';
import { dashboardPaths } from '~/constants/paths';
import { ListingGroupRowActions } from './listing-group-row-actions';
import { ListingSummaryCell } from './listing-summary-cell';
import { ListingVisibilitySwitch } from './listing-visibility-switch';

/** Figma-adapted columns for multi-item listing groups. */
export function buildListingGroupColumns(opts: {
  listingTypes: ListingTypeResponse[];
  canWrite: boolean;
  canPublish: boolean;
  /** Post ids with an edit (their own or an item's) waiting for the tenant. */
  pendingChangeIds?: ReadonlySet<string>;
}): DataTableColumn<ListingGroupResponse>[] {
  const typeById = new Map(opts.listingTypes.map((type) => [type.id, type]));

  return [
    {
      id: 'listing',
      header: 'Bài đăng',
      enableHiding: false,
      cell: (group) => (
        <ListingSummaryCell
          href={dashboardPaths.partner.listingGroup(group.id)}
          title={group.title}
          photos={group.photos}
          favoriteCount={group.favoriteCount}
          ratingAvg={group.ratingAvg}
          status={group.status}
          hasPendingChange={opts.pendingChangeIds?.has(group.id) ?? false}
        />
      ),
      className: 'min-w-[22rem] px-4 py-3',
      headClassName: 'min-w-[22rem] px-4',
    },
    {
      id: 'type',
      header: 'Danh mục',
      columnLabel: 'Danh mục',
      cell: (group) => (
        <span className="font-medium">{typeById.get(group.listingTypeId)?.name ?? '—'}</span>
      ),
      className: 'min-w-36 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'bookings',
      header: 'Số đơn đặt',
      columnLabel: 'Số đơn đặt',
      cell: (group) => <span className="tabular-nums">{group.bookingCount}</span>,
      className: 'min-w-28 px-4',
      headClassName: 'px-4',
    },
    {
      id: 'visibility',
      header: 'Hiển thị',
      enableHiding: false,
      cell: (group) => (
        <ListingVisibilitySwitch
          id={group.id}
          target="group"
          title={group.title}
          status={group.status}
          hiddenBy={group.hiddenBy}
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
      cell: (group) => {
        const itemLabel = typeById.get(group.listingTypeId)?.itemLabel || 'hạng mục';
        return (
          <span className="whitespace-nowrap">
            {group.listingCount} {itemLabel}
            <span className="text-muted-foreground"> · {group.readyListingCount} sẵn sàng</span>
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
      cell: (group) => <ListingStatusBadge status={group.status} />,
      className: 'px-4',
      headClassName: 'px-4',
    },
    {
      id: 'updatedAt',
      header: 'Cập nhật',
      columnLabel: 'Cập nhật',
      defaultVisible: false,
      cell: (group) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(group.updatedAt)}
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
      cell: (group) => (
        <ListingGroupRowActions
          group={group}
          canWrite={opts.canWrite}
          canPublish={opts.canPublish}
        />
      ),
    },
  ];
}
