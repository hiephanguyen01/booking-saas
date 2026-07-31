import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Repeat,
  SquareDashedMousePointer,
  Users,
} from 'lucide-react';
import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  ListingResponse,
  PartnerCalendarBookingResponse,
  PricingRuleResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { SuccessBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { addDays, parseDay, toDayString, todayString } from '~/lib/calendar-dates';
import { dayKey } from '~/lib/format';
import {
  WEEKDAY_HEADS,
  bucketBookingsByDay,
  calendarDays,
  closureStateOf,
  dateMatches,
  datesBetween,
  defaultPrice,
  formatDayShort,
  hasRecurringOn,
  monthShift,
  openWindowsFor,
  pricingRulesForCell,
  weekday,
  type CalendarMode,
} from '~/features/partner/lib/listing-calendar';
import { DayCell } from './day-cell';
import { DayDialog } from './day-dialog';
import { RangeDialog } from './range-dialog';
import { WeekGrid } from './week-grid';

/** Monday `days` away — the week nav's only date arithmetic. */
function shiftWeek(weekStart: string, days: number): string {
  return toDayString(addDays(parseDay(weekStart), days));
}

interface Props {
  listing: ListingResponse;
  month: string;
  mode: CalendarMode;
  rules: PricingRuleResponse[];
  exceptions: AvailabilityExceptionResponse[];
  weeklyRules: AvailabilityRuleResponse[];
  bookings: PartnerCalendarBookingResponse[];
  /** Other listings sharing this listing's resource calendar. */
  siblingCount: number;
  view: 'month' | 'week';
  /** Monday of the week on screen, and its seven dates. */
  weekStart: string;
  weekDates: string[];
  canWrite: boolean;
  canAvailability: boolean;
}

export function ListingCalendarPricing({
  listing,
  month,
  mode,
  rules,
  exceptions,
  weeklyRules,
  bookings,
  siblingCount,
  view,
  weekStart,
  weekDates,
  canWrite,
  canAvailability,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [presetWindow, setPresetWindow] = useState<{ from: string; to: string } | null>(null);
  const today = todayString();

  const days = useMemo(() => calendarDays(month), [month]);
  const exceptionMap = useMemo(
    () => new Map(exceptions.map((item) => [item.date, item])),
    [exceptions],
  );
  const bookingsByDay = useMemo(() => bucketBookingsByDay(bookings, dayKey), [bookings]);
  const basePrice = defaultPrice(listing, mode);
  const canPricing = canWrite && listing.bookingSelection === 'flexible_duration';
  const enabledModes = listing.bookingModes.filter(
    (item): item is CalendarMode => item === 'hourly' || item === 'daily',
  );
  const rangeDates = range ? datesBetween(range.from, range.to) : [];

  /** Every calendar link carries the whole view state, so no nav loses a setting. */
  const calendarLink = (patch: { mode?: CalendarMode; view?: 'month' | 'week'; month?: string; week?: string }): string => {
    const next = { mode, view, month, week: weekStart, ...patch };
    return `?tab=calendar&mode=${next.mode}&view=${next.view}&month=${next.month}&week=${next.week}`;
  };

  /**
   * A plain click edits one day; shift-click (or the explicit range toggle, for
   * touch) spans from the previous pick. Both end in a dialog, so the grid never
   * holds an unresolved selection the partner has to remember.
   */
  const pick = (date: string, extendRange: boolean): void => {
    setNotice(null);
    const spanning = extendRange || rangeMode;
    if (spanning && anchor && anchor !== date) {
      const [from, to] = anchor <= date ? [anchor, date] : [date, anchor];
      setRange({ from, to });
      setAnchor(null);
      return;
    }
    if (spanning) {
      setAnchor(date);
      return;
    }
    setAnchor(date);
    setSelected(date);
  };

  const closeDay = (): void => {
    setSelected(null);
    setAnchor(null);
    setPresetWindow(null);
  };
  const closeRange = (): void => {
    setRange(null);
    setAnchor(null);
  };

  const selectedRules = selected
    ? rules.filter((rule) => rule.bookingMode === mode && dateMatches(rule, selected))
    : [];
  const selectedException = selected ? exceptionMap.get(selected) : undefined;
  const selectedWeekdayOpen = selected
    ? mode === 'daily'
      ? weeklyRules.length === 0 || weeklyRules.some((rule) => rule.dayOfWeek === weekday(selected))
      : weeklyRules.some((rule) => rule.dayOfWeek === weekday(selected))
    : false;

  // Recurring rules price whole weekdays / time bands. They are not tied to a
  // date so no cell can show them, yet they do change what a customer pays —
  // surface them instead of letting the grid imply the base price applies.
  const recurringRules = rules.filter(
    (rule) =>
      rule.bookingMode === mode &&
      (rule.ruleType === 'day_of_week' || rule.ruleType === 'time_range'),
  );
  const noWeeklySchedule = weeklyRules.length === 0;

  if (enabledModes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
        <CalendarDays className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 font-semibold">Chưa hỗ trợ lịch theo giờ/ngày</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tin đăng này đang dùng một hình thức đặt khác với theo giờ hoặc theo ngày.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="size-4 text-primary" /> Lịch vận hành
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ngày không có thiết lập riêng sẽ dùng lịch tuần và giá mặc định của tin đăng. Giữ Shift
            khi bấm để chọn một dải ngày.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabledModes.map((item) => (
            <Button key={item} asChild size="sm" variant={item === mode ? 'default' : 'outline'}>
              <Link to={calendarLink({ mode: item })}>
                {item === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
              </Link>
            </Button>
          ))}
          {mode === 'hourly' ? (
            // An hour grid only carries information for hourly listings — a
            // night is one priced unit, so rows of hours would say nothing.
            <div className="flex rounded-lg border p-0.5">
              <Button asChild size="sm" variant={view === 'month' ? 'secondary' : 'ghost'}>
                <Link to={calendarLink({ view: 'month' })}>Tháng</Link>
              </Button>
              <Button asChild size="sm" variant={view === 'week' ? 'secondary' : 'ghost'}>
                <Link to={calendarLink({ view: 'week' })}>Tuần</Link>
              </Button>
            </div>
          ) : null}
          <Button
            size="sm"
            variant={rangeMode ? 'default' : 'outline'}
            aria-pressed={rangeMode}
            onClick={() => {
              setRangeMode((on) => !on);
              setAnchor(null);
            }}
          >
            <SquareDashedMousePointer className="size-4" /> Chọn nhiều ngày
          </Button>
          {canAvailability ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/partner/listings/${listing.id}/hours`}>
                <Clock3 className="size-4" /> Lịch tuần
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <SuccessBanner message={notice} />

      {rangeMode ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          {anchor
            ? `Đã chọn ngày đầu ${anchor.slice(8)}/${anchor.slice(5, 7)} — bấm ngày cuối để chốt dải.`
            : 'Bấm ngày đầu rồi bấm ngày cuối của dải.'}
        </div>
      ) : null}

      {siblingCount > 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Users className="size-4" /> Dùng chung lịch với {siblingCount} tin đăng khác
          </p>
          <p className="mt-1">
            Mở cửa / đóng cửa được lưu theo <strong>tài nguyên</strong>, nên thay đổi ở đây áp cho
            tất cả các tin đăng đó. Giá thì không — giá riêng của từng tin đăng.
          </p>
        </div>
      ) : null}

      {noWeeklySchedule ? (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            mode === 'hourly'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-dashed text-muted-foreground',
          )}
        >
          {mode === 'hourly' ? (
            <>
              Chưa khai báo lịch tuần nên <strong>mọi ngày đều đóng</strong> và không nhận được đặt
              lịch. Hãy khai báo giờ mở cửa ở mục “Lịch tuần”.
            </>
          ) : (
            <>
              Chưa khai báo lịch tuần — theo ngày sẽ <strong>mở tất cả các ngày</strong>. Khai báo
              “Lịch tuần” nếu bạn muốn giới hạn một số thứ trong tuần.
            </>
          )}
        </div>
      ) : null}

      {recurringRules.length > 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Repeat className="size-4" /> {recurringRules.length} quy tắc giá lặp lại đang áp dụng
          </p>
          <p className="mt-1">
            {mode === 'hourly'
              ? 'Ô ngày có dấu ↻ chịu ảnh hưởng của các quy tắc này, nên giá hiển thị chưa phải giá cuối.'
              : 'Ô ngày đã tính các quy tắc này; giá riêng đặt cho một ngày cụ thể vẫn đè lên.'}
          </p>
          <ul className="mt-2 space-y-1">
            {recurringRules.map((rule) => (
              <li key={rule.id} className="text-xs">
                {rule.ruleType === 'time_range'
                  ? `Khung giờ ${String(rule.params.from)}–${String(rule.params.to)}`
                  : `Theo thứ trong tuần`}{' '}
                · <Money value={rule.salePrice ?? rule.price} />
                {mode === 'hourly' ? '/giờ' : '/ngày'}
              </li>
            ))}
          </ul>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="?tab=pricing">Quản lý giá lặp lại</Link>
          </Button>
        </div>
      ) : null}

      {listing.bookingSelection === 'fixed_packages' ? (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Giá của tin đăng này được quản lý trong mục “Các gói dịch vụ”. Lịch giá riêng không áp dụng cho gói cố định.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Button asChild variant="ghost" size="icon" aria-label={view === 'week' ? 'Tuần trước' : 'Tháng trước'}>
            <Link
              to={
                view === 'week'
                  ? calendarLink({ week: shiftWeek(weekStart, -7) })
                  : calendarLink({ month: monthShift(month, -1) })
              }
            >
              <ChevronLeft />
            </Link>
          </Button>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Lịch và giá</p>
            <p className="font-semibold">
              {view === 'week'
                ? `${formatDayShort(weekDates[0] ?? weekStart)} – ${formatDayShort(weekDates[6] ?? weekStart)}`
                : `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`}
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label={view === 'week' ? 'Tuần sau' : 'Tháng sau'}>
            <Link
              to={
                view === 'week'
                  ? calendarLink({ week: shiftWeek(weekStart, 7) })
                  : calendarLink({ month: monthShift(month, 1) })
              }
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
        {view === 'week' ? null : (
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {WEEKDAY_HEADS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
        )}
        {view === 'week' ? (
          <WeekGrid
            dates={weekDates}
            mode={mode}
            rules={rules}
            weeklyRules={weeklyRules}
            exceptionMap={exceptionMap}
            bookings={bookings}
            today={today}
            onPickWindow={(date, from, to) => {
              setNotice(null);
              setPresetWindow({ from, to });
              setSelected(date);
            }}
          />
        ) : (
          <div className="grid grid-cols-7">
            {days.map((date, index) =>
              date ? (
                <DayCell
                  key={date}
                  date={date}
                  mode={mode}
                  closure={closureStateOf(date, mode, weeklyRules, exceptionMap.get(date))}
                  rules={pricingRulesForCell(date, mode, rules)}
                  basePrice={basePrice}
                  bookingCount={bookingsByDay.get(date)?.length ?? 0}
                  // Daily cells already fold the weekly rule into their price, so
                  // only hourly needs the "this is not the final price" marker.
                  hasRecurring={mode === 'hourly' && hasRecurringOn(date, mode, rules)}
                  isPast={date < today}
                  isSelected={
                    date === anchor || (rangeDates.length > 0 && rangeDates.includes(date))
                  }
                  onPick={pick}
                />
              ) : (
                <div key={`empty-${index}`} className="min-h-24 border-r border-b bg-muted/10" />
              ),
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm border bg-card" /> Mở theo lịch tuần
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm border bg-primary/5" /> Mở theo giờ riêng
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm border bg-emerald-50 dark:bg-emerald-950/40" /> Có giá
          sale
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm border bg-muted/50" /> Nghỉ theo lịch tuần
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm border bg-destructive/10" /> Đóng cả ngày (đặt riêng)
        </span>
      </div>

      <DayDialog
        date={selected}
        mode={mode}
        basePrice={basePrice}
        weekdayOpen={selectedWeekdayOpen}
        openWindows={selected ? openWindowsFor(selected, weeklyRules, selectedException) : []}
        exception={selectedException}
        rules={selectedRules}
        bookings={selected ? (bookingsByDay.get(selected) ?? []) : []}
        presetWindow={presetWindow}
        canAvailability={canAvailability}
        canPricing={canPricing}
        onClose={closeDay}
        onSaved={(message, closeDialog) => {
          setNotice(message);
          if (closeDialog) closeDay();
        }}
      />

      <RangeDialog
        range={range}
        dates={rangeDates}
        mode={mode}
        basePrice={basePrice}
        bookings={rangeDates.flatMap((date) => bookingsByDay.get(date) ?? [])}
        canAvailability={canAvailability}
        canPricing={canPricing}
        onClose={closeRange}
        onSaved={(message) => {
          setNotice(message);
          closeRange();
        }}
      />
    </div>
  );
}
