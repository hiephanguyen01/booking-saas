import { Link } from 'react-router';
import type { ListingGroupResponse, ListingTypeResponse } from '@booking/contracts';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Money } from '~/components/money';
import { ListingTypeIcon } from '~/components/listing-type-icon';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';
import { dashboardPaths } from '~/constants/paths';

/** Table columns for the multi-item (grouped) listings index. */
export function buildListingGroupColumns(opts: {
  listingTypes: ListingTypeResponse[];
}): DataTableColumn<ListingGroupResponse>[] {
  const typeById = new Map(opts.listingTypes.map((t) => [t.id, t]));
  return [
    {
      header: 'Tin đăng',
      cell: (g) => (
        <div className="min-w-0">
          <Link
            to={dashboardPaths.partner.listingGroup(g.id)}
            className="truncate font-medium hover:underline"
          >
            {g.title}
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">/{g.slug}</p>
        </div>
      ),
    },
    {
      header: 'Loại dịch vụ',
      cell: (g) => {
        const type = typeById.get(g.listingTypeId);
        return (
          <span className="flex items-center gap-2 text-sm">
            <ListingTypeIcon
              imageUrl={type?.iconImageUrl}
              name={type?.icon}
              className="size-4 text-muted-foreground"
            />
            <span className="truncate">{type?.name ?? '—'}</span>
          </span>
        );
      },
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Hạng mục',
      cell: (g) => {
        const itemLabel = typeById.get(g.listingTypeId)?.itemLabel || 'hạng mục';
        return (
          <span className="whitespace-nowrap text-sm">
            {g.listingCount} {itemLabel}
            <span className="text-muted-foreground"> · {g.readyListingCount} sẵn sàng</span>
          </span>
        );
      },
    },
    {
      header: 'Giá từ',
      cell: (g) =>
        g.priceFrom ? (
          <Money value={g.priceFrom} />
        ) : (
          <span className="text-sm text-muted-foreground">Chưa có giá</span>
        ),
    },
    {
      header: 'Cập nhật',
      cell: (g) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(g.updatedAt)}
        </span>
      ),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Trạng thái',
      cell: (g) => <ListingStatusBadge status={g.status} />,
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (g) => (
        <Link
          to={dashboardPaths.partner.listingGroup(g.id)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Quản lý
        </Link>
      ),
    },
  ];
}
