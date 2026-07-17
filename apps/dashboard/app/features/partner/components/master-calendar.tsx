import { useMemo, useState } from 'react';
import { Ban, Clock, Plus, User } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import { Button } from '@booking/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@booking/ui/components/ui/empty';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { dayKey, formatTime, formatVnd, minutesOfDay } from '~/lib/format';
import { bookingStatusMeta } from '~/components/status-badge';
import { parseDay } from '~/lib/calendar-dates';
import { WEEKDAY_SHORT } from '~/constants/time';

interface ListingType {
  id: string;
  name: string;
}

interface MasterCalendarProps {
  view: 'week' | 'day';
  /** Column day strings ("YYYY-MM-DD"); 7 for week, 1 for day. */
  days: string[];
  bookings: PartnerCalendarBookingResponse[];
  listingTypes: ListingType[];
  today: string;
  /** Opens the quick-block dialog prefilled for a given calendar day. */
  onQuickBlock: (day: string) => void;
}


function bucketByDay(bookings: PartnerCalendarBookingResponse[]): Map<string, PartnerCalendarBookingResponse[]> {
  const map = new Map<string, PartnerCalendarBookingResponse[]>();
  for (const b of bookings) {
    const key = dayKey(b.startUtc);
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }
  return map;
}

function dayHeader(day: string): { weekday: string; date: string } {
  const d = parseDay(day);
  return { weekday: WEEKDAY_SHORT[d.getUTCDay()], date: String(d.getUTCDate()).padStart(2, '0') };
}

/** The master calendar: every booking across the partner's resources, week/day. */
export function MasterCalendar({
  view,
  days,
  bookings,
  listingTypes,
  today,
  onQuickBlock,
}: MasterCalendarProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (typeFilter === 'all' ? bookings : bookings.filter((b) => b.listingTypeId === typeFilter)),
    [bookings, typeFilter],
  );
  const byDay = useMemo(() => bucketByDay(filtered), [filtered]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{filtered.length}</span> lượt đặt trong kỳ
        </p>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue placeholder="Lọc theo loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại hình</SelectItem>
            {listingTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {view === 'week' ? (
        <WeekGrid days={days} byDay={byDay} today={today} onQuickBlock={onQuickBlock} />
      ) : (
        <DayGrid day={days[0]} bookings={byDay.get(days[0]) ?? []} onQuickBlock={onQuickBlock} />
      )}
    </div>
  );
}

function WeekGrid({
  days,
  byDay,
  today,
  onQuickBlock,
}: {
  days: string[];
  byDay: Map<string, PartnerCalendarBookingResponse[]>;
  today: string;
  onQuickBlock: (day: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[840px] grid-cols-7 divide-x">
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          const isToday = day === today;
          const { weekday, date } = dayHeader(day);
          return (
            <div key={day} className="flex min-h-[26rem] flex-col">
              <div
                className={cn(
                  'sticky top-0 z-10 flex items-center justify-between gap-1 border-b bg-card/95 px-2.5 py-2 backdrop-blur',
                  isToday && 'bg-primary/5',
                )}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium uppercase text-muted-foreground">{weekday}</span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      isToday && 'flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground',
                    )}
                  >
                    {date}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onQuickBlock(day)}
                  title="Chặn lịch ngày này"
                  className="rounded-md p-1 text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5" aria-hidden />
                  <span className="sr-only">Chặn lịch</span>
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                {items.length === 0 ? (
                  <span className="px-1 pt-2 text-xs text-muted-foreground/60">-</span>
                ) : (
                  items.map((b) => <EventChip key={b.id} booking={b} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayGrid({
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

  const hours = useMemo(() => {
    if (timed.length === 0) return Array.from({ length: 13 }, (_, i) => i + 7); // 07:00-19:00
    const mins = timed.map((b) => minutesOfDay(b.startUtc));
    const min = Math.min(...mins, 8 * 60);
    const max = Math.max(...mins, 18 * 60);
    const from = Math.floor(min / 60);
    const to = Math.min(23, Math.ceil(max / 60));
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [timed]);

  const byHour = useMemo(() => {
    const map = new Map<number, PartnerCalendarBookingResponse[]>();
    for (const b of timed) {
      const h = Math.floor(minutesOfDay(b.startUtc) / 60);
      const list = map.get(h) ?? [];
      list.push(b);
      map.set(h, list);
    }
    return map;
  }, [timed]);

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
              <EventChip key={b.id} booking={b} />
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
                  <EventChip key={b.id} booking={b} className="min-w-[12rem]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EventChip({ booking, className }: { booking: PartnerCalendarBookingResponse; className?: string }) {
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
            <p className="text-xs tabular-nums text-muted-foreground">
              {booking.customer.phone}
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
