import * as React from 'react';
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Ban, Check, PackageCheck, Undo2, UserX, X } from 'lucide-react';
import type { BookingStatus } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { Button } from '@booking/ui/components/ui/button';
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
import { Money } from '~/components/money';
import type { PartnerBookingActionResult } from './partner-booking-actions.server';

/**
 * The minimal booking shape the action buttons need. Both
 * `PartnerCalendarBookingResponse` (list/calendar feed) and
 * `PartnerBookingResponse` (detail) satisfy it structurally, so one component
 * serves every partner surface.
 */
export interface PartnerActionableBooking {
  id: string;
  code: string;
  status: BookingStatus;
  bookingMode: string;
  listingTitle: string;
  pickedUpAt: string | null;
  returnedAt: string | null;
  securityDeposit: string;
  endUtc: string;
}

/** 48h after the slot end — matches the backend no-show window (§8.2). */
const NO_SHOW_AFTER_END_MS = 48 * 60 * 60 * 1000;

/** A confirmed booking whose slot end + the backend's 48h window has elapsed. */
function isNoShowEligible(booking: PartnerActionableBooking): boolean {
  return (
    booking.status === 'confirmed' &&
    Date.now() >= new Date(booking.endUtc).getTime() + NO_SHOW_AFTER_END_MS
  );
}

type DialogKind = 'reject' | 'no-show' | 'cancel' | 'return';

/**
 * The partner's approve / reject / no-show / cancel / pick-up / return controls
 * for one booking. Owns its own fetcher, so it drops into a table row or a detail
 * page unchanged; both routes' actions delegate to `runPartnerBookingAction`,
 * which returns the {@link PartnerBookingActionResult} this reads back.
 */
export function PartnerBookingActions({
  booking,
  canApprove,
  canManage,
  size = 'xs',
  align = 'end',
  emptyLabel,
  className,
}: {
  booking: PartnerActionableBooking;
  canApprove: boolean;
  canManage: boolean;
  size?: 'xs' | 'sm';
  align?: 'start' | 'end';
  /** Rendered when no action is available; omit to render nothing. */
  emptyLabel?: string;
  className?: string;
}): React.JSX.Element | null {
  const fetcher = useFetcher<PartnerBookingActionResult>();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const busy = fetcher.state !== 'idle';

  const isInventory = booking.bookingMode === 'inventory';
  const submit = (intent: string): void => {
    fetcher.submit({ id: booking.id, intent }, { method: 'post' });
  };

  const buttons: React.ReactNode[] = [];

  if (booking.status === 'pending_approval' && canApprove) {
    buttons.push(
      <Button key="approve" type="button" size={size} disabled={busy} onClick={() => submit('approve')}>
        <Check className="size-3.5" aria-hidden /> Duyệt
      </Button>,
      <Button key="reject" type="button" size={size} variant="outline" disabled={busy} onClick={() => setDialog('reject')}>
        <X className="size-3.5" aria-hidden /> Từ chối
      </Button>,
    );
  }

  if (booking.status === 'confirmed' && canManage) {
    if (isInventory && !booking.pickedUpAt) {
      buttons.push(
        <Button key="pickup" type="button" size={size} variant="outline" disabled={busy} onClick={() => submit('pick-up')}>
          <PackageCheck className="size-3.5" aria-hidden /> Giao thiết bị
        </Button>,
      );
    }
    if (isInventory && booking.pickedUpAt && !booking.returnedAt) {
      buttons.push(
        <Button key="return" type="button" size={size} variant="outline" disabled={busy} onClick={() => setDialog('return')}>
          <Undo2 className="size-3.5" aria-hidden /> Nhận trả
        </Button>,
      );
    }
    if (isNoShowEligible(booking)) {
      buttons.push(
        <Button
          key="no-show"
          type="button"
          size={size}
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
        size={size}
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        disabled={busy}
        onClick={() => setDialog('cancel')}
      >
        <Ban className="size-3.5" aria-hidden /> Huỷ
      </Button>,
    );
  }

  const result = fetcher.data && fetcher.data.ok ? fetcher.data : null;
  const cancelRefund = result?.intent === 'cancel' ? result.refund : null;

  if (buttons.length === 0 && !cancelRefund) {
    return emptyLabel ? <span className="text-xs text-muted-foreground">{emptyLabel}</span> : null;
  }

  return (
    <div className={cn('flex flex-col gap-2', align === 'end' ? 'items-end' : 'items-start', className)}>
      {cancelRefund ? (
        <p className="text-xs text-muted-foreground">
          Đã huỷ · hoàn {cancelRefund.refundPercent}% ={' '}
          <Money className="font-medium text-foreground" value={cancelRefund.refundAmount} />
        </p>
      ) : null}

      {buttons.length > 0 ? (
        <div className={cn('flex flex-wrap gap-1.5', align === 'end' ? 'justify-end' : 'justify-start')}>
          {buttons}
        </div>
      ) : null}

      <ReasonDialog
        open={dialog === 'reject'}
        onOpenChange={(open) => setDialog(open ? 'reject' : null)}
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
        onOpenChange={(open) => setDialog(open ? 'no-show' : null)}
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
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        fetcher={fetcher}
        booking={booking}
        intent="cancel"
        title="Huỷ lượt đặt"
        description="Đối tác huỷ luôn hoàn tiền đầy đủ cho khách (§8.2)."
        placeholder="Lý do huỷ (tuỳ chọn)…"
        confirmLabel="Huỷ & hoàn tiền cho khách"
        busy={busy}
      />
      <ReturnDialog
        open={dialog === 'return'}
        onOpenChange={(open) => setDialog(open ? 'return' : null)}
        fetcher={fetcher}
        booking={booking}
        busy={busy}
      />
    </div>
  );
}

type ActionFetcher = ReturnType<typeof useFetcher<PartnerBookingActionResult>>;

/**
 * Optional-reason confirmation dialog for reject / no-show / cancel. Submits via
 * the shared fetcher; the route action re-validates the reason.
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
  fetcher: ActionFetcher;
  booking: PartnerActionableBooking;
  intent: 'reject' | 'no-show' | 'cancel';
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  busy: boolean;
}): React.JSX.Element {
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
  fetcher: ActionFetcher;
  booking: PartnerActionableBooking;
  busy: boolean;
}): React.JSX.Element {
  const settlement =
    fetcher.data && fetcher.data.ok && fetcher.data.intent === 'return'
      ? fetcher.data.settlement
      : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nhận trả thiết bị</DialogTitle>
          <DialogDescription>
            Lượt đặt <span className="font-mono">{booking.code}</span> · {booking.listingTitle}
            <span className="mt-1 block">
              Cọc thiết bị: <Money value={booking.securityDeposit} />
            </span>
          </DialogDescription>
        </DialogHeader>

        {settlement ? (
          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <SettleRow label="Hoàn cọc" value={<Money value={settlement.depositRefund} />} />
            {settlement.lateFee !== '0' ? (
              <SettleRow label="Phí trễ hạn" value={<Money value={settlement.lateFee} />} />
            ) : null}
            {settlement.depositShortfall !== '0' ? (
              <SettleRow label="Còn thiếu (khách nợ)" value={<Money value={settlement.depositShortfall} />} />
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
              <p className="text-xs text-muted-foreground">
                Khấu trừ từ tiền cọc; để 0 nếu thiết bị nguyên vẹn.
              </p>
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

function SettleRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
