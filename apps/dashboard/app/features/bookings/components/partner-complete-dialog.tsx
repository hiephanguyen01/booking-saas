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

/** Confirm delivered service + cash collected before the settlement dispute window starts. */
export function PartnerCompleteDialog({
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
  const expectedOnsite = (() => {
    const final = BigInt(booking.finalAmount || '0');
    const charges = booking.additionalCharges.reduce(
      (total, charge) => total + BigInt(charge.amount || '0'),
      0n,
    );
    const paid = BigInt(booking.paidAmount || '0');
    const due = final + charges;
    return (due > paid ? due - paid : 0n).toString();
  })();
  const result = fetcher.data?.intent === 'complete' ? fetcher.data : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hoàn thành dịch vụ</DialogTitle>
          <DialogDescription>
            Xác nhận dịch vụ đã hoàn tất và số tiền khách đã trả trực tiếp. Sau bước này, tiền giữ
            online bắt đầu thời gian tranh chấp.
          </DialogDescription>
        </DialogHeader>

        {result?.ok ? (
          <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
            Đã hoàn thành lượt đặt và mở thời gian tranh chấp.
          </div>
        ) : (
          <fetcher.Form method="post" className="space-y-4" onSubmit={onSubmit} aria-busy={busy}>
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="intent" value="complete" />
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Khách còn trả tại chỗ</span>
                <Money value={expectedOnsite} className="font-medium" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`onsite-${booking.id}`}>Đã thu tại chỗ (VND)</Label>
              <Input
                id={`onsite-${booking.id}`}
                name="onsiteCollectedAmount"
                inputMode="numeric"
                pattern="\d*"
                defaultValue={expectedOnsite}
                required
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Hệ thống đối chiếu đúng số còn lại; sai lệch cần được xử lý trước khi hoàn thành.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`complete-note-${booking.id}`}>Ghi chú (tuỳ chọn)</Label>
              <Textarea
                id={`complete-note-${booking.id}`}
                name="note"
                rows={2}
                maxLength={500}
                disabled={busy}
              />
            </div>
            {result && !result.ok ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : null}
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
                Xác nhận hoàn thành
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}

        {result?.ok ? (
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
