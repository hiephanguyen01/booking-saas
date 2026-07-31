import { useMemo, useState } from 'react';
import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  PartnerCalendarBookingResponse,
  PricingRuleResponse,
} from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { WEEKDAY_SHORT } from '~/constants/time';
import { formatVndCompact, dayKey, minutesOfDay } from '~/lib/format';
import { parseDay } from '~/lib/calendar-dates';
import {
  effectivePriceOf,
  hourIsOpen,
  ruleCoveringHour,
  weekHourRows,
  type CalendarMode,
} from '~/features/partner/lib/listing-calendar';

interface Props {
  dates: string[];
  mode: CalendarMode;
  rules: PricingRuleResponse[];
  weeklyRules: AvailabilityRuleResponse[];
  exceptionMap: Map<string, AvailabilityExceptionResponse>;
  bookings: PartnerCalendarBookingResponse[];
  today: string;
  /** Raised once a drag finishes, with the hours the partner swept. */
  onPickWindow: (date: string, from: string, to: string) => void;
}

interface DragState {
  date: string;
  anchorHour: number;
  focusHour: number;
}

const stamp = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/**
 * A week as hours × days, for one hourly listing.
 *
 * The month grid squeezes a whole day into one cell, so it can say "3 khung giá"
 * but never WHICH hours — and for an hourly listing the priced hours are the
 * business. This grid answers that, and a vertical drag turns "that band is
 * unpriced" straight into the dialog that prices it.
 *
 * Deliberately not the same thing as "Lịch tổng": that screen plots bookings for
 * every resource, this one plots one listing's prices. Bookings appear here only
 * as a dot, for context.
 */
export function WeekGrid({
  dates,
  mode,
  rules,
  weeklyRules,
  exceptionMap,
  bookings,
  today,
  onPickWindow,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const hours = useMemo(
    () => weekHourRows(dates, weeklyRules, exceptionMap),
    [dates, weeklyRules, exceptionMap],
  );
  // Hours a booking occupies, keyed `date|hour`, so a cell lookup stays O(1).
  const bookedHours = useMemo(() => {
    const set = new Set<string>();
    for (const booking of bookings) {
      const date = dayKey(booking.startUtc);
      const from = Math.floor(minutesOfDay(booking.startUtc) / 60);
      const rawEnd = minutesOfDay(booking.endUtc);
      // An end at exactly HH:00 does not occupy that hour; a booking running
      // past midnight reads as ending at 23 rather than wrapping backwards.
      const to = rawEnd <= minutesOfDay(booking.startUtc) ? 23 : Math.ceil(rawEnd / 60) - 1;
      for (let hour = from; hour <= to; hour += 1) set.add(`${date}|${hour}`);
    }
    return set;
  }, [bookings]);

  const finishDrag = (): void => {
    if (!drag) return;
    const [low, high] =
      drag.anchorHour <= drag.focusHour
        ? [drag.anchorHour, drag.focusHour]
        : [drag.focusHour, drag.anchorHour];
    setDrag(null);
    onPickWindow(drag.date, stamp(low), stamp(high + 1));
  };

  const inDrag = (date: string, hour: number): boolean => {
    if (!drag || drag.date !== date) return false;
    const [low, high] =
      drag.anchorHour <= drag.focusHour
        ? [drag.anchorHour, drag.focusHour]
        : [drag.focusHour, drag.anchorHour];
    return hour >= low && hour <= high;
  };

  return (
    <div className="overflow-x-auto rounded-xl border bg-card" onPointerUp={finishDrag}>
      <div className="min-w-[46rem]">
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b bg-muted/30">
          <div className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">Giờ</div>
          {dates.map((date) => {
            const day = parseDay(date);
            return (
              <div
                key={date}
                className={cn(
                  'px-2 py-2 text-center text-xs',
                  date === today && 'bg-primary/5 font-semibold',
                )}
              >
                <div className="font-medium text-muted-foreground">
                  {WEEKDAY_SHORT[day.getUTCDay()]}
                </div>
                <div className="tabular-nums">{String(day.getUTCDate()).padStart(2, '0')}</div>
              </div>
            );
          })}
        </div>

        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b last:border-b-0">
            <div className="border-r px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">
              {stamp(hour)}
            </div>
            {dates.map((date) => {
              const open = hourIsOpen(date, hour, weeklyRules, exceptionMap.get(date));
              const rule = ruleCoveringHour(rules, date, hour, mode);
              const booked = bookedHours.has(`${date}|${hour}`);
              const isPast = date < today;
              const selected = inDrag(date, hour);
              return (
                <button
                  key={date}
                  type="button"
                  disabled={isPast}
                  aria-label={`${date} ${stamp(hour)} — ${open ? 'mở cửa' : 'ngoài giờ mở cửa'}${
                    rule ? ', có giá riêng' : ''
                  }${booked ? ', có lượt đặt' : ''}`}
                  onPointerDown={() =>
                    !isPast && setDrag({ date, anchorHour: hour, focusHour: hour })
                  }
                  onPointerEnter={() =>
                    drag && drag.date === date && setDrag({ ...drag, focusHour: hour })
                  }
                  className={cn(
                    'relative min-h-9 border-r px-1 py-1 text-left text-[11px] transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    open ? 'hover:bg-accent/60' : 'bg-muted/50',
                    rule && 'bg-primary/10 font-medium',
                    selected && 'bg-primary/25',
                    isPast && 'cursor-not-allowed opacity-40',
                  )}
                >
                  {rule ? (
                    <span className="tabular-nums">{formatVndCompact(effectivePriceOf(rule))}</span>
                  ) : null}
                  {booked ? (
                    <span
                      className="absolute right-1 bottom-1 size-1.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
