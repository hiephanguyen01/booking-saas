import { useMemo } from 'react';
import { Ban, Clock } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { bucketByHour, deriveHourRows } from './calendar-buckets';
import { CalendarEventChip } from './calendar-event-chip';

/** One day: all-day/multi-day bookings on top, hourly bookings on an hour grid. */
export function CalendarDayGrid({
  day,
  bookings,
  onQuickBlock,
}: {
  day: string;
  bookings: PartnerCalendarBookingResponse[];
  onQuickBlock: (day: string) => void;
}) {
  const allDay = bookings.filter((b) => b.bookingMode !== 'hourly');
  const timed = bookings.filter((b) => b.bookingMode === 'hourly');

  const hours = useMemo(() => deriveHourRows(timed), [timed]);
  const byHour = useMemo(() => bucketByHour(timed), [timed]);

  if (bookings.length === 0) {
    return (
      <div className="rounded-lg border">
        <div className="flex items-center justify-end border-b p-2">
          <Button size="sm" variant="outline" onClick={() => onQuickBlock(day)}>
            <Ban className="size-3.5" aria-hidden /> Chặn lịch
          </Button>
        </div>
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Chưa có lượt đặt</EmptyTitle>
            <EmptyDescription>Ngày này chưa có lượt đặt nào trên các tài nguyên của bạn.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={() => onQuickBlock(day)}>
              <Ban className="size-3.5" aria-hidden /> Chặn lịch ngày này
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => onQuickBlock(day)}>
          <Ban className="size-3.5" aria-hidden /> Chặn lịch
        </Button>
      </div>
      {allDay.length > 0 ? (
        <div className="rounded-lg border p-2.5">
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Theo ngày · dài ngày
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {allDay.map((b) => (
              <CalendarEventChip key={b.id} booking={b} />
            ))}
          </div>
        </div>
      ) : null}
      {timed.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          {hours.map((h) => (
            <div key={h} className="grid grid-cols-[3.5rem_1fr] border-b last:border-b-0">
              <div className="border-r bg-muted/30 px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                {String(h).padStart(2, '0')}:00
              </div>
              <div className="flex flex-wrap gap-1.5 p-1.5">
                {(byHour.get(h) ?? []).map((b) => (
                  <CalendarEventChip key={b.id} booking={b} className="min-w-[12rem]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
