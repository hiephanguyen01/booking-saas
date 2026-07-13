import { useMemo, useState } from 'react';
import { data, useFetcher } from 'react-router';
import { Ban, Check, PackageCheck, Undo2, UserX, X } from 'lucide-react';
import {
  markReturnedInputSchema,
  reasonInputSchema,
  type BookingStatus,
  type PartnerCalendarBookingResponse,
  type ReturnBookingResponse,
} from '@booking/shared';
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
import { Input } from '@booking/ui/components/ui/input';
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

/** Read an optional trimmed string form field, coercing blanks to undefined. */
function readReason(form: FormData): string | undefined {
  const v = form.get('reason');
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? undefined : s;
}

type ActionResult = {
  ok: boolean;
  error: string | null;
  settlement: { depositRefund: string; depositShortfall: string; lateFee: string } | null;
};

const ok = (settlement: ActionResult['settlement'] = null): ActionResult => ({ ok: true, error: null, settlement });
const fail = (error: string): ActionResult => ({ ok: false, error, settlement: null });

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');
  if (!id) return data(fail('Thiếu mã lượt đặt.'), { status: 400 });

  const canApprove = canPartner(membership, 'partner.bookings.approve');
  const canManage = canPartner(membership, 'partner.bookings.cancel');

  if (intent === 'approve') {
    if (!canApprove) return data(fail('Không có quyền duyệt lượt đặt.'), { status: 403 });
    const res = await apiPost(`/partner/bookings/${id}/approve`, {}, auth);
    return res.ok ? data(ok()) : data(fail(res.error ?? 'Duyệt không thành công.'), { status: 400 });
  }

  if (intent === 'reject') {
    if (!canApprove) return data(fail('Không có quyền từ chối lượt đặt.'), { status: 403 });
    const parsed = reasonInputSchema.safeParse({ reason: readReason(form) });
    if (!parsed.success) return data(fail('Lý do không hợp lệ (tối đa 500 ký tự).'), { status: 400 });
    const body = parsed.data.reason ? { reason: parsed.data.reason } : {};
    const res = await apiPost(`/partner/bookings/${id}/reject`, body, auth);
    return res.ok ? data(ok()) : data(fail(res.error ?? 'Từ chối không thành công.'), { status: 400 });
  }

  if (intent === 'no-show') {
    if (!canManage) return data(fail('Không có quyền đánh dấu vắng mặt.'), { status: 403 });
    const parsed = reasonInputSchema.safeParse({ reason: readReason(form) });
    if (!parsed.success) return data(fail('Lý do không hợp lệ (tối đa 500 ký tự).'), { status: 400 });
    const body = parsed.data.reason ? { reason: parsed.data.reason } : {};
    const res = await apiPost(`/partner/bookings/${id}/no-show`, body, auth);
    return res.ok ? data(ok()) : data(fail(res.error ?? 'Đánh dấu vắng mặt không thành công.'), { status: 400 });
  }

  if (intent === 'cancel') {
    if (!canManage) return data(fail('Không có quyền huỷ lượt đặt.'), { status: 403 });
    const parsed = reasonInputSchema.safeParse({ reason: readReason(form) });
    if (!parsed.success) return data(fail('Lý do không hợp lệ (tối đa 500 ký tự).'), { status: 400 });
    const body = parsed.data.reason ? { reason: parsed.data.reason } : {};
    const res = await apiPost(`/partner/bookings/${id}/cancel`, body, auth);
    return res.ok ? data(ok()) : data(fail(res.error ?? 'Huỷ không thành công.'), { status: 400 });
  }

  if (intent === 'pick-up') {
    if (!canManage) return data(fail('Không có quyền nhận thiết bị.'), { status: 403 });
    const res = await apiPost(`/partner/bookings/${id}/pick-up`, {}, auth);
    return res.ok ? data(ok()) : data(fail(res.error ?? 'Đánh dấu nhận thiết bị không thành công.'), { status: 400 });
  }

  if (intent === 'return') {
    if (!canManage) return data(fail('Không có quyền nhận trả thiết bị.'), { status: 403 });
    const damageAmount = String(form.get('damageAmount') ?? '0').trim() || '0';
    const parsed = markReturnedInputSchema.safeParse({ damageAmount, reason: readReason(form) });
    if (!parsed.success) return data(fail('Số tiền hư hỏng không hợp lệ (số nguyên VND).'), { status: 400 });
    const res = await apiPost<ReturnBookingResponse>(`/partner/bookings/${id}/return`, parsed.data, auth);
    return res.ok && res.data
      ? data(
          ok({
            depositRefund: res.data.depositRefund,
            depositShortfall: res.data.depositShortfall,
            lateFee: res.data.lateFee,
          }),
        )
      : data(fail(res.error ?? 'Nhận trả thiết bị không thành công.'), { status: 400 });
  }

  return data(fail('Hành động không hợp lệ.'), { status: 400 });
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
      cell: (b) =>
        canApprove || canManage ? (
          <RowActions booking={b} canApprove={canApprove} canManage={canManage} />
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
            : `Không có lượt đặt ở trạng thái “${BOOKING_STATUS[filter as BookingStatus]?.label ?? filter}”.`
        }
      />
    </div>
  );
}

/** 48h after the slot end — matches the backend no-show window (§8.2). */
const NO_SHOW_AFTER_END_MS = 48 * 60 * 60 * 1000;

/** A confirmed booking whose slot end + the backend's 48h window has elapsed. */
function isNoShowEligible(booking: PartnerCalendarBookingResponse): boolean {
  return (
    booking.status === 'confirmed' &&
    Date.now() >= new Date(booking.endUtc).getTime() + NO_SHOW_AFTER_END_MS
  );
}

type DialogKind = 'reject' | 'no-show' | 'cancel' | 'return';

function RowActions({
  booking,
  canApprove,
  canManage,
}: {
  booking: PartnerCalendarBookingResponse;
  canApprove: boolean;
  canManage: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const busy = fetcher.state !== 'idle';

  const isInventory = booking.bookingMode === 'inventory';
  const submit = (intent: string): void => {
    fetcher.submit({ id: booking.id, intent }, { method: 'post' });
  };

  const buttons: React.ReactNode[] = [];

  if (booking.status === 'pending_approval' && canApprove) {
    buttons.push(
      <Button key="approve" type="button" size="xs" disabled={busy} onClick={() => submit('approve')}>
        <Check className="size-3.5" aria-hidden /> Duyệt
      </Button>,
      <Button key="reject" type="button" size="xs" variant="outline" disabled={busy} onClick={() => setDialog('reject')}>
        <X className="size-3.5" aria-hidden /> Từ chối
      </Button>,
    );
  }

  if (booking.status === 'confirmed' && canManage) {
    if (isInventory && !booking.pickedUpAt) {
      buttons.push(
        <Button key="pickup" type="button" size="xs" variant="outline" disabled={busy} onClick={() => submit('pick-up')}>
          <PackageCheck className="size-3.5" aria-hidden /> Giao thiết bị
        </Button>,
      );
    }
    if (isInventory && booking.pickedUpAt && !booking.returnedAt) {
      buttons.push(
        <Button key="return" type="button" size="xs" variant="outline" disabled={busy} onClick={() => setDialog('return')}>
          <Undo2 className="size-3.5" aria-hidden /> Nhận trả
        </Button>,
      );
    }
    if (isNoShowEligible(booking)) {
      buttons.push(
        <Button
          key="no-show"
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => setDialog('no-show')}
        >
          <UserX className="size-3.5" aria-hidden /> Vắng mặt
        </Button>,
      );
    }
  }

  if ((booking.status === 'confirmed' || booking.status === 'pending_payment') && canManage) {
    buttons.push(
      <Button
        key="cancel"
        type="button"
        size="xs"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        disabled={busy}
        onClick={() => setDialog('cancel')}
      >
        <Ban className="size-3.5" aria-hidden /> Huỷ
      </Button>,
    );
  }

  if (buttons.length === 0) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {buttons}

      <ReasonDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => setDialog(o ? 'reject' : null)}
        fetcher={fetcher}
        booking={booking}
        intent="reject"
        title="Từ chối lượt đặt"
        placeholder="Cho khách biết vì sao lượt đặt bị từ chối…"
        confirmLabel="Từ chối lượt đặt"
        busy={busy}
      />
      <ReasonDialog
        open={dialog === 'no-show'}
        onOpenChange={(o) => setDialog(o ? 'no-show' : null)}
        fetcher={fetcher}
        booking={booking}
        intent="no-show"
        title="Đánh dấu vắng mặt"
        placeholder="Ghi chú (tuỳ chọn) về việc khách không đến…"
        confirmLabel="Đánh dấu vắng mặt"
        busy={busy}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => setDialog(o ? 'cancel' : null)}
        fetcher={fetcher}
        booking={booking}
        intent="cancel"
        title="Huỷ lượt đặt"
        description="Đối tác huỷ luôn hoàn tiền 100% cho khách (§8.2)."
        placeholder="Lý do huỷ (tuỳ chọn)…"
        confirmLabel="Huỷ & hoàn tiền 100%"
        busy={busy}
      />
      <ReturnDialog
        open={dialog === 'return'}
        onOpenChange={(o) => setDialog(o ? 'return' : null)}
        fetcher={fetcher}
        booking={booking}
        busy={busy}
      />
    </div>
  );
}

/**
 * Optional-reason confirmation dialog for reject / no-show / cancel. Submits via
 * the shared fetcher; the route `action` re-validates the reason.
 */
function ReasonDialog({
  open,
  onOpenChange,
  fetcher,
  booking,
  intent,
  title,
  description,
  placeholder,
  confirmLabel,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
  booking: PartnerCalendarBookingResponse;
  intent: 'reject' | 'no-show' | 'cancel';
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ? <span className="block">{description}</span> : null}
            Lượt đặt <span className="font-mono">{booking.code}</span> · {booking.listingTitle}
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" onSubmit={() => onOpenChange(false)} className="space-y-4">
          <input type="hidden" name="id" value={booking.id} />
          <input type="hidden" name="intent" value={intent} />
          <div className="space-y-2">
            <Label htmlFor={`reason-${intent}-${booking.id}`}>Lý do (tuỳ chọn)</Label>
            <Textarea
              id={`reason-${intent}-${booking.id}`}
              name="reason"
              rows={3}
              maxLength={500}
              placeholder={placeholder}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inventory return (§9.4): partner records a damage amount deducted from the
 * security deposit; the action returns the settlement (refund / shortfall / late
 * fee), shown here before the dialog is dismissed.
 */
function ReturnDialog({
  open,
  onOpenChange,
  fetcher,
  booking,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
  booking: PartnerCalendarBookingResponse;
  busy: boolean;
}) {
  const settlement = fetcher.data && fetcher.data.ok ? fetcher.data.settlement : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nhận trả thiết bị</DialogTitle>
          <DialogDescription>
            Lượt đặt <span className="font-mono">{booking.code}</span> · {booking.listingTitle}
            <span className="mt-1 block">Cọc thiết bị: {formatVnd(booking.securityDeposit)}</span>
          </DialogDescription>
        </DialogHeader>

        {settlement ? (
          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <SettleRow label="Hoàn cọc" value={formatVnd(settlement.depositRefund)} />
            {settlement.lateFee !== '0' ? <SettleRow label="Phí trễ hạn" value={formatVnd(settlement.lateFee)} /> : null}
            {settlement.depositShortfall !== '0' ? (
              <SettleRow label="Còn thiếu (khách nợ)" value={formatVnd(settlement.depositShortfall)} />
            ) : null}
          </div>
        ) : (
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="intent" value="return" />
            <div className="space-y-2">
              <Label htmlFor={`damage-${booking.id}`}>Số tiền hư hỏng (VND)</Label>
              <Input
                id={`damage-${booking.id}`}
                name="damageAmount"
                inputMode="numeric"
                defaultValue="0"
                pattern="\d*"
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Khấu trừ từ tiền cọc; để 0 nếu thiết bị nguyên vẹn.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`return-reason-${booking.id}`}>Ghi chú (tuỳ chọn)</Label>
              <Textarea id={`return-reason-${booking.id}`} name="reason" rows={2} maxLength={500} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
              <Button type="submit" disabled={busy}>
                Xác nhận nhận trả
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}

        {settlement ? (
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Xong
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SettleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
