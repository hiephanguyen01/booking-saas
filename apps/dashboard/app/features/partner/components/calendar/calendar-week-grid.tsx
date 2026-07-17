import { Plus } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { parseDay } from '~/lib/calendar-dates';
import { WEEKDAY_SHORT } from '~/constants/time';
import { CalendarEventChip } from './calendar-event-chip';

function dayHeader(day: string): { weekday: string; date: string } {
  const d = parseDay(day);
  return { weekday: WEEKDAY_SHORT[d.getUTCDay()], date: String(d.getUTCDate()).padStart(2, '0') };
}

/** Mon…Sun columns; each day lists its bookings and offers a quick-block "+" . */
export function CalendarWeekGrid({
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
                  items.map((b) => <CalendarEventChip key={b.id} booking={b} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
