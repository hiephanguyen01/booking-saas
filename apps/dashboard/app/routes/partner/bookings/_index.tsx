import { Link, useSearchParams } from 'react-router';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { PageHeader } from '~/components/page-header';
import { BookingStatusBadge } from '~/components/status-badge';
import { Money } from '~/components/money';
import { formatDate, formatTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { BOOKINGS_FILTER_SPEC } from '~/features/bookings/lib/booking-filters';
import { dashboardPaths } from '~/constants/paths';
import { runPartnerBookingAction } from '~/features/bookings/server/partner-booking-actions.server';
import { PartnerBookingActions } from '~/features/bookings/components/partner-booking-actions';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Lượt đặt · Đối tác · BookingOS' }];
}

// URL-driven status options (no client-side filtering). `all` clears the param.
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending_approval', label: 'Chờ duyệt' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã huỷ' },
];
const PARTNER_BOOKINGS_FILTER_SPEC: FilterSpec = [
  ...BOOKINGS_FILTER_SPEC.map((field) =>
    field.kind === 'date-range' ? { ...field, label: 'Ngày diễn ra' } : field,
  ),
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    allLabel: 'Tất cả trạng thái',
    options: STATUS_FILTERS.filter(({ value }) => value !== 'all'),
  },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.bookings.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PARTNER_BOOKINGS_FILTER_SPEC);
  // No fixed window any more: `from`/`to` come from the filters (unbounded when unset).
  const feed = await apiGet<PartnerCalendarBookingResponse[]>(apiPaths.partner.bookings, auth, {
    query: toApiQuery(apiFilters),
    signal: request.signal,
  });
  return {
    bookings: feed.ok && feed.data ? feed.data : [],
    canApprove: can('partner.bookings.approve'),
    // partner.bookings.cancel backs no-show, cancel, and inventory pick-up/return.
    canManage: can('partner.bookings.cancel'),
    canWrite: can('partner.bookings.write'),
    loadError: feed.ok ? null : (feed.error ?? 'Không tải được danh sách lượt đặt.'),
    filters,
    actionNow: Date.now(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  return runPartnerBookingAction({ request, auth, can });
}

export default function PartnerBookingsPage({ loaderData }: Route.ComponentProps) {
  const { bookings, canApprove, canManage, canWrite, loadError, filters, actionNow } = loaderData;
  const [searchParams] = useSearchParams();
  const { pageSize } = readListParams(searchParams);
  const pendingCount = bookings.filter((b) => b.status === 'pending_approval').length;

  const columns: DataTableColumn<PartnerCalendarBookingResponse>[] = [
    {
      header: 'Mã',
      cell: (b) => (
        <Link
          to={`/partner/bookings/${b.id}`}
          className="font-mono text-xs font-medium text-primary hover:underline"
        >
          {b.code}
        </Link>
      ),
    },
    {
      header: 'Khách hàng',
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.customer.fullName}</p>
          {b.customer.phone ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {b.customer.phone}
              {b.customer.phoneMasked ? ' · đã ẩn' : ''}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Tin đăng',
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.listingTitle}</p>
          <p className="text-xs text-muted-foreground">{b.listingTypeName}</p>
        </div>
      ),
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Thời gian',
      cell: (b) => (
        <div className="whitespace-nowrap text-sm">
          <p>{formatDate(b.startUtc, b.resourceTimezone)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatTime(b.startUtc, b.resourceTimezone)} -{' '}
            {formatTime(b.endUtc, b.resourceTimezone)}
          </p>
        </div>
      ),
    },
    {
      header: 'Số khách',
      cell: (b) => <span className="tabular-nums">{b.guestCount}</span>,
      className: 'hidden tabular-nums lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Giá trị',
      cell: (b) => <Money className="font-medium" value={b.finalAmount} />,
      headClassName: 'text-right',
      className: 'text-right',
    },
    {
      header: 'Trạng thái',
      cell: (b) => <BookingStatusBadge status={b.status} />,
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (b) =>
        canApprove || canManage || canWrite ? (
          <PartnerBookingActions
            booking={b}
            canApprove={canApprove}
            canManage={canManage}
            canWrite={canWrite}
            initialNow={actionNow}
            emptyLabel="-"
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lượt đặt"
        description={
          pendingCount > 0
            ? `${pendingCount} lượt đang chờ bạn duyệt.`
            : 'Quản lý các lượt đặt trên tài nguyên của bạn.'
        }
      />

      <DashboardDataTable
        columns={columns}
        data={bookings}
        getRowKey={(booking) => booking.id}
        filters={PARTNER_BOOKINGS_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.partner.bookings}
        pageSize={pageSize}
        error={loadError}
        emptyMessage={
          hasActiveFilters(filters) ? 'Không có lượt đặt nào khớp bộ lọc.' : 'Chưa có lượt đặt nào.'
        }
      />
    </div>
  );
}
