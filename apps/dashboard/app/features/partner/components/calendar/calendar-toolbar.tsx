import { Link, useSearchParams } from 'react-router';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { formatDate } from '~/lib/format';
import { addDays, mondayOf, parseDay, startOfDayUtc, toDayString } from '~/lib/calendar-dates';

/** Build a link to the same route with an updated query param set. */
function useCalendarLink() {
  const [params] = useSearchParams();
  return (patch: Record<string, string>): string => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    return `?${next.toString()}`;
  };
}

/** Prev / today / next navigation, the period label, and the week⇄day switch. */
export function CalendarToolbar({
  view,
  anchor,
  today,
  days,
}: {
  view: 'week' | 'day';
  anchor: string;
  today: string;
  /** Column day strings ("YYYY-MM-DD"); 7 for week, 1 for day. */
  days: string[];
}) {
  const link = useCalendarLink();

  const rangeLabel =
    view === 'day'
      ? formatDate(startOfDayUtc(days[0]))
      : `${formatDate(startOfDayUtc(days[0]))} - ${formatDate(startOfDayUtc(days[6]))}`;

  const monday = mondayOf(parseDay(anchor));
  const prevAnchor = toDayString(
    addDays(view === 'day' ? parseDay(anchor) : monday, view === 'day' ? -1 : -7),
  );
  const nextAnchor = toDayString(
    addDays(view === 'day' ? parseDay(anchor) : monday, view === 'day' ? 1 : 7),
  );
  const anchorKey = view === 'day' ? 'day' : 'week';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="icon-sm" aria-label="Kỳ trước">
          <Link to={link({ [anchorKey]: prevAnchor })} prefetch="intent">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={link({ [anchorKey]: today })} prefetch="intent">
            Hôm nay
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon-sm" aria-label="Kỳ sau">
          <Link to={link({ [anchorKey]: nextAnchor })} prefetch="intent">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <span className="ml-2 flex items-center gap-2 text-sm font-medium tabular-nums">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          {rangeLabel}
        </span>
      </div>

      <div className="inline-flex rounded-md border p-0.5">
        {(['week', 'day'] as const).map((v) => (
          <Link
            key={v}
            to={link({
              view: v,
              ...(v === 'day'
                ? { day: view === 'day' ? anchor : today }
                : { week: view === 'week' ? anchor : today }),
            })}
            prefetch="intent"
            className={cn(
              'rounded px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              view === v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v === 'week' ? 'Tuần' : 'Ngày'}
          </Link>
        ))}
      </div>
    </div>
  );
}
