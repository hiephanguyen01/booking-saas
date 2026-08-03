import * as React from 'react';
import type { useFetcher } from 'react-router';
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
import type { PartnerBookingActionResult } from '~/features/bookings/server/partner-booking-actions.server';
import type { PartnerActionableBooking } from '~/features/bookings/lib/partner-booking-rules';

type ActionFetcher = ReturnType<typeof useFetcher<PartnerBookingActionResult>>;

/**
 * Inventory return (§9.4): partner records a damage amount deducted from the
 * security deposit; the action returns the settlement (refund / shortfall / late
 * fee), shown here before the dialog is dismissed. Submits via the shared
 * fetcher owned by `PartnerBookingActions`.
 */
export function PartnerReturnDialog({
  open,
  onOpenChange,
  fetcher,
  booking,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: ActionFetcher;
  booking: PartnerActionableBooking;
  busy: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.JSX.Element {
  const settlement =
    fetcher.data && fetcher.data.ok && fetcher.data.intent === 'return'
      ? fetcher.data.settlement
      : null;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
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
          <fetcher.Form method="post" className="space-y-4" onSubmit={onSubmit} aria-busy={busy}>
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
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Khấu trừ từ tiền cọc; để 0 nếu thiết bị nguyên vẹn.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`return-reason-${booking.id}`}>Ghi chú (tuỳ chọn)</Label>
              <Textarea
                id={`return-reason-${booking.id}`}
                name="reason"
                rows={2}
                maxLength={500}
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
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
