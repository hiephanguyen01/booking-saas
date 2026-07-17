import * as React from 'react';
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Ban, Check, PackageCheck, Undo2, UserX, X } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import { Button } from '@booking/ui/components/ui/button';
import { Money } from '~/components/money';
import { ReasonDialog } from '~/components/reason-dialog';
import type { PartnerBookingActionResult } from './partner-booking-actions.server';
import {
  availablePartnerBookingActions,
  type PartnerActionableBooking,
  type PartnerBookingActionKind,
} from './partner-booking-rules';
import { PartnerReturnDialog } from './partner-return-dialog';

export type { PartnerActionableBooking } from './partner-booking-rules';

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

  const submit = (intent: string, reason?: string): void => {
    fetcher.submit(
      reason === undefined ? { id: booking.id, intent } : { id: booking.id, intent, reason },
      { method: 'post' },
    );
  };

  const actions = availablePartnerBookingActions(booking, { canApprove, canManage });
  const buttons = actions.map((kind) => renderAction(kind));

  function renderAction(kind: PartnerBookingActionKind): React.ReactNode {
    switch (kind) {
      case 'approve':
        return (
          <Button key="approve" type="button" size={size} disabled={busy} onClick={() => submit('approve')}>
            <Check className="size-3.5" aria-hidden /> Duyệt
          </Button>
        );
      case 'reject':
        return (
          <Button key="reject" type="button" size={size} variant="outline" disabled={busy} onClick={() => setDialog('reject')}>
            <X className="size-3.5" aria-hidden /> Từ chối
          </Button>
        );
      case 'pick-up':
        return (
          <Button key="pickup" type="button" size={size} variant="outline" disabled={busy} onClick={() => submit('pick-up')}>
            <PackageCheck className="size-3.5" aria-hidden /> Giao thiết bị
          </Button>
        );
      case 'return':
        return (
          <Button key="return" type="button" size={size} variant="outline" disabled={busy} onClick={() => setDialog('return')}>
            <Undo2 className="size-3.5" aria-hidden /> Nhận trả
          </Button>
        );
      case 'no-show':
        return (
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
          </Button>
        );
      case 'cancel':
        return (
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
          </Button>
        );
    }
  }

  const result = fetcher.data && fetcher.data.ok ? fetcher.data : null;
  const cancelRefund = result?.intent === 'cancel' ? result.refund : null;

  if (buttons.length === 0 && !cancelRefund) {
    return emptyLabel ? <span className="text-xs text-muted-foreground">{emptyLabel}</span> : null;
  }

  const bookingLine = (
    <>
      Lượt đặt <span className="font-mono">{booking.code}</span> · {booking.listingTitle}
    </>
  );

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
        title="Từ chối lượt đặt"
        description={bookingLine}
        placeholder="Cho khách biết vì sao lượt đặt bị từ chối…"
        submitLabel="Từ chối lượt đặt"
        tone="destructive"
        busy={busy}
        onSubmit={(reason) => submit('reject', reason)}
      />
      <ReasonDialog
        open={dialog === 'no-show'}
        onOpenChange={(open) => setDialog(open ? 'no-show' : null)}
        title="Đánh dấu vắng mặt"
        description={bookingLine}
        placeholder="Ghi chú (tuỳ chọn) về việc khách không đến…"
        submitLabel="Đánh dấu vắng mặt"
        tone="destructive"
        busy={busy}
        onSubmit={(reason) => submit('no-show', reason)}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        title="Huỷ lượt đặt"
        description={
          <>
            <span className="block">Đối tác huỷ luôn hoàn tiền đầy đủ cho khách (§8.2).</span>
            {bookingLine}
          </>
        }
        placeholder="Lý do huỷ (tuỳ chọn)…"
        submitLabel="Huỷ & hoàn tiền cho khách"
        tone="destructive"
        busy={busy}
        onSubmit={(reason) => submit('cancel', reason)}
      />
      <PartnerReturnDialog
        open={dialog === 'return'}
        onOpenChange={(open) => setDialog(open ? 'return' : null)}
        fetcher={fetcher}
        booking={booking}
        busy={busy}
      />
    </div>
  );
}
