import { useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { bucketByDay } from './calendar/calendar-buckets';
import { CalendarWeekGrid } from './calendar/calendar-week-grid';
import { CalendarDayGrid } from './calendar/calendar-day-grid';

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
        <CalendarWeekGrid days={days} byDay={byDay} today={today} onQuickBlock={onQuickBlock} />
      ) : (
        <CalendarDayGrid
          day={days[0]}
          bookings={byDay.get(days[0]) ?? []}
          onQuickBlock={onQuickBlock}
        />
      )}
    </div>
  );
}
