import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BookingStatus, PartnerCalendarBookingResponse } from '@booking/contracts';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePartner, canPartner } from '../partner.server';
import { PageHeader } from '~/components/page-header';
import { BookingStatusBadge, bookingStatusMeta } from '~/components/status-badge';
import { Money } from '~/components/money';
import { formatDate, formatTime } from '~/lib/format';
import { addDays, parseDay, startOfDayUtc, todayString, toDayString } from '../components/calendar-dates';
import { runPartnerBookingAction } from '~/features/bookings/partner-booking-actions.server';
import { PartnerBookingActions } from '~/features/bookings/partner-booking-actions';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Lượt đặt · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.bookings.read')) {
    throw new Response('Không có quyền xem lượt đặt.', { status: 403 });
  }
  // Window kept under the backend's 62-day feed cap: 14 days back, 45 forward.
  const today = parseDay(todayString());
  const from = startOfDayUtc(toDayString(addDays(today, -14)));
  const to = startOfDayUtc(toDayString(addDays(today, 45)));
  const feed = await apiGet<PartnerCalendarBookingResponse[]>(
    `/partner/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    auth,
  );
  return {
    bookings: feed.ok && feed.data ? feed.data : [],
    canApprove: canPartner(membership, 'partner.bookings.approve'),
    // partner.bookings.cancel backs no-show, cancel, and inventory pick-up/return.
    canManage: canPartner(membership, 'partner.bookings.cancel'),
    loadError: feed.ok ? null : (feed.error ?? 'Không tải được danh sách lượt đặt.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  return runPartnerBookingAction({ request, auth, can: (key) => canPartner(membership, key) });
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending_approval', label: 'Chờ duyệt' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

export default function PartnerBookingsPage({ loaderData }: Route.ComponentProps) {
  const { bookings, canApprove, canManage, loadError } = loaderData;
  const [filter, setFilter] = useState<string>('all');

  const rows = useMemo(
    () => (filter === 'all' ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending_approval').length,
    [bookings],
  );

  const columns: DataTableColumn<PartnerCalendarBookingResponse>[] = [
    {
      header: 'Mã',
      cell: (b) => (
        <Link to={`/partner/bookings/${b.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
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
          <p>{formatDate(b.startUtc)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatTime(b.startUtc)} - {formatTime(b.endUtc)}
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
        canApprove || canManage ? (
          <PartnerBookingActions booking={b} canApprove={canApprove} canManage={canManage} emptyLabel="-" />
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

      <div className="w-full max-w-xs">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
                {f.value === 'pending_approval' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(b) => b.id}
        emptyMessage={
          filter === 'all'
            ? 'Chưa có lượt đặt nào trong khoảng thời gian này.'
            : `Không có lượt đặt ở trạng thái “${bookingStatusMeta(filter as BookingStatus).label}”.`
        }
      />
    </div>
  );
}
