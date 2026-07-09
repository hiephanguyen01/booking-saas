import { useMemo, useState } from 'react';
import { data, useFetcher } from 'react-router';
import { Check, X } from 'lucide-react';
import type { BookingStatus } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import type { Route } from './+types/bookings';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './lib.server';
import type { PartnerCalendarBooking } from './types';
import { PageHeader } from './components/page-header';
import { BookingStatusBadge } from './components/booking-status-badge';
import { formatDate, formatTime, formatVnd, BOOKING_STATUS } from './components/format';
import { addDays, parseDay, startOfDayUtc, todayString, toDayString } from './components/calendar-dates';

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
  const feed = await apiGet<PartnerCalendarBooking[]>(
    `/partner/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    auth,
  );
  return {
    bookings: feed.ok && feed.data ? feed.data : [],
    canApprove: canPartner(membership, 'partner.bookings.approve'),
    loadError: feed.ok ? null : (feed.error ?? 'Không tải được danh sách lượt đặt.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.bookings.approve')) {
    return data({ ok: false, error: 'Không có quyền duyệt lượt đặt.' }, { status: 403 });
  }
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');
  if (!id) return data({ ok: false, error: 'Thiếu mã lượt đặt.' }, { status: 400 });

  if (intent === 'approve') {
    const res = await apiPost(`/partner/bookings/${id}/approve`, {}, auth);
    return res.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: res.error ?? 'Duyệt không thành công.' }, { status: 400 });
  }
  if (intent === 'reject') {
    const reason = String(form.get('reason') ?? '').trim();
    const res = await apiPost(`/partner/bookings/${id}/reject`, reason ? { reason } : {}, auth);
    return res.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: res.error ?? 'Từ chối không thành công.' }, { status: 400 });
  }
  return data({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending_approval', label: 'Chờ duyệt' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

export default function PartnerBookingsPage({ loaderData }: Route.ComponentProps) {
  const { bookings, canApprove, loadError } = loaderData;
  const [filter, setFilter] = useState<string>('all');

  const rows = useMemo(
    () => (filter === 'all' ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending_approval').length,
    [bookings],
  );

  const columns: DataTableColumn<PartnerCalendarBooking>[] = [
    {
      header: 'Mã',
      cell: (b) => <span className="font-mono text-xs text-muted-foreground">{b.code}</span>,
    },
    {
      header: 'Tin đăng',
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.listingTitle}</p>
          <p className="text-xs text-muted-foreground">{b.listingTypeName}</p>
        </div>
      ),
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
      header: 'Khách',
      cell: (b) => <span className="tabular-nums">{b.guestCount}</span>,
      className: 'tabular-nums',
    },
    {
      header: 'Giá trị',
      cell: (b) => <span className="font-medium tabular-nums">{formatVnd(b.finalAmount)}</span>,
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
      cell: (b) => (canApprove ? <RowActions booking={b} /> : null),
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
            : `Không có lượt đặt ở trạng thái “${BOOKING_STATUS[filter as BookingStatus]?.label ?? filter}”.`
        }
      />
    </div>
  );
}

function RowActions({ booking }: { booking: PartnerCalendarBooking }) {
  const fetcher = useFetcher<typeof action>();
  const [declineOpen, setDeclineOpen] = useState(false);
  const busy = fetcher.state !== 'idle';

  if (booking.status !== 'pending_approval') {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="flex justify-end gap-1.5">
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={booking.id} />
        <input type="hidden" name="intent" value="approve" />
        <Button type="submit" size="xs" disabled={busy}>
          <Check className="size-3.5" aria-hidden /> Duyệt
        </Button>
      </fetcher.Form>
      <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => setDeclineOpen(true)}>
        <X className="size-3.5" aria-hidden /> Từ chối
      </Button>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối lượt đặt</DialogTitle>
            <DialogDescription>
              Lượt đặt <span className="font-mono">{booking.code}</span> · {booking.listingTitle}
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form
            method="post"
            onSubmit={() => setDeclineOpen(false)}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="intent" value="reject" />
            <div className="space-y-2">
              <Label htmlFor={`reason-${booking.id}`}>Lý do (tuỳ chọn)</Label>
              <Textarea
                id={`reason-${booking.id}`}
                name="reason"
                rows={3}
                placeholder="Cho khách biết vì sao lượt đặt bị từ chối…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeclineOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                Từ chối lượt đặt
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
