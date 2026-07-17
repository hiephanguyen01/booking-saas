import { Clock, User } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { formatTime, formatVnd } from '~/lib/format';
import { bookingStatusMeta } from '~/components/status-badge';
import { PhoneLink } from '~/components/contact-link';

/** One booking chip on the calendar; the popover carries the booking summary. */
export function CalendarEventChip({
  booking,
  className,
}: {
  booking: PartnerCalendarBookingResponse;
  className?: string;
}) {
  const meta = bookingStatusMeta(booking.status);
  const isHourly = booking.bookingMode === 'hourly';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full rounded-md border px-2 py-1.5 text-left text-xs transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            meta.event,
            className,
          )}
        >
          <span className="flex items-center gap-1 font-medium tabular-nums">
            {isHourly ? formatTime(booking.startUtc) : booking.listingTypeName}
          </span>
          <span className="mt-0.5 block truncate font-medium">{booking.listingTitle}</span>
          <span className="block truncate text-muted-foreground">{booking.customer.fullName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{booking.code}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.event)}>
              {meta.label}
            </span>
          </div>
          <p className="text-sm font-semibold leading-snug">{booking.listingTitle}</p>
          <p className="text-xs text-muted-foreground">{booking.listingTypeName}</p>
          <p className="pt-0.5 text-sm font-medium">{booking.customer.fullName}</p>
          {booking.customer.phone ? (
            <p className="text-xs text-muted-foreground">
              <PhoneLink phone={booking.customer.phone} masked={booking.customer.phoneMasked} />
              {booking.customer.phoneMasked ? ' · đã ẩn' : ''}
            </p>
          ) : null}
        </div>
        <dl className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            <span className="tabular-nums text-foreground">
              {formatTime(booking.startUtc)} - {formatTime(booking.endUtc)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="size-3.5" aria-hidden />
            <span className="text-foreground">
              {booking.guestCount} khách{booking.quantity > 1 ? ` · ${booking.quantity} đơn vị` : ''}
            </span>
          </div>
        </dl>
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-xs text-muted-foreground">Giá trị</span>
          <span className="text-sm font-semibold tabular-nums">{formatVnd(booking.finalAmount)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
