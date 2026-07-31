import { TriangleAlert } from 'lucide-react';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Label } from '@booking/ui/components/ui/label';
import { BookingStatusBadge } from '~/components/status-badge';
import { formatDayShort } from '~/features/partner/lib/listing-calendar';
import { dayKey, formatTime } from '~/lib/format';

interface Props {
  bookings: PartnerCalendarBookingResponse[];
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

/**
 * Shown before closing a day that bookings still hold.
 *
 * Closing only blocks NEW bookings — the ones listed here stay valid and those
 * customers will still turn up. That is the whole reason this needs an explicit
 * acknowledgement rather than a passive note: the partner is not cancelling
 * anything by closing the day, and must not believe they are.
 */
export function BookingWarning({ bookings, acknowledged, onAcknowledgedChange }: Props) {
  if (bookings.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4" aria-hidden /> {bookings.length} lượt đặt đang giữ chỗ
      </p>
      <p className="text-xs text-muted-foreground">
        Đóng cửa chỉ chặn lượt đặt <strong>mới</strong>. Các lượt dưới đây vẫn còn hiệu lực và khách
        vẫn sẽ đến — muốn huỷ thì phải xử lý từng lượt ở mục “Lượt đặt”.
      </p>
      <ul className="space-y-1.5">
        {bookings.map((booking) => (
          <li key={booking.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{booking.code}</span>
            <span className="text-muted-foreground">
              {formatDayShort(dayKey(booking.startUtc))} {formatTime(booking.startUtc)}–
              {formatTime(booking.endUtc)}
            </span>
            <BookingStatusBadge status={booking.status} />
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-2">
        <Checkbox
          id="ack-bookings"
          checked={acknowledged}
          onCheckedChange={(value) => onAcknowledgedChange(value === true)}
        />
        <Label htmlFor="ack-bookings" className="text-xs font-normal leading-snug">
          Tôi hiểu các lượt đặt này vẫn còn hiệu lực sau khi đóng cửa.
        </Label>
      </div>
    </div>
  );
}
