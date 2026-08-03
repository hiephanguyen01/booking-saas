import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Repeat,
  SquareDashedMousePointer,
  Users,
  X,
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
import { dashboardPaths } from '~/constants/paths';
import { todayString } from '~/lib/calendar-dates';
import { dayKey } from '~/lib/format';
import {
  WEEKDAY_HEADS,
  bucketBookingsByDay,
  calendarDays,
  closureStateOf,
  dateMatches,
  datesBetween,
  defaultPrice,
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
  canWrite: boolean;
  canAvailability: boolean;
}

function calendarUrl(listingId: string, month: string, mode: CalendarMode): string {
  const params = new URLSearchParams({ tab: 'calendar', month, mode });
  return `${dashboardPaths.partner.listing(listingId)}?${params.toString()}`;
}

const LEGEND_ITEMS = [
  { label: 'Mở theo lịch tuần', className: 'bg-card' },
  { label: 'Mở theo giờ riêng', className: 'bg-primary/10' },
  { label: 'Có giá ưu đãi', className: 'bg-success/15' },
  { label: 'Nghỉ theo lịch tuần', className: 'bg-muted' },
  { label: 'Đóng riêng', className: 'bg-destructive/15' },
] as const;

function CalendarLegend() {
  const items = (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-2 whitespace-nowrap">
          <span className={cn('size-3 rounded-sm border', item.className)} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );

  return (
    <>
      <div className="hidden border-b px-4 py-3 sm:block">{items}</div>
      <details className="group border-b sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-xs font-medium [&::-webkit-details-marker]:hidden">
          Chú thích lịch
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        <div className="border-t bg-muted/15 px-4 py-3">{items}</div>
      </details>
    </>
  );
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
  canWrite,
  canAvailability,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = todayString();

  const days = useMemo(() => calendarDays(month), [month]);
  const exceptionMap = useMemo(
    () => new Map(exceptions.map((item) => [item.date, item])),
    [exceptions],
  );
  const bookingsByDay = useMemo(() => bucketBookingsByDay(bookings, dayKey), [bookings]);
  const basePrice = defaultPrice(listing, mode);
  const canPricing = canWrite && listing.bookingSelection === 'flexible_duration';
  const canEditCalendar = canAvailability || canPricing;
  const enabledModes = listing.bookingModes.filter(
    (item): item is CalendarMode => item === 'hourly' || item === 'daily',
  );
  const rangeDates = range ? datesBetween(range.from, range.to) : [];
  const currentMonth = today.slice(0, 7);
  const listingPath = dashboardPaths.partner.listing(listing.id);

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
  };
  const closeRange = (): void => {
    setRange(null);
    setAnchor(null);
    setRangeMode(false);
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
    <div className="space-y-4">
      <section
        className="rounded-2xl border bg-card p-5 shadow-none"
        aria-labelledby="calendar-overview-title"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="calendar-overview-title" className="font-semibold">
                Lịch vận hành
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Chọn một ngày để thay đổi giờ mở cửa hoặc giá riêng. Ngày chưa chỉnh sẽ dùng lịch
                tuần và giá cơ bản.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {enabledModes.length > 1 ? (
              <nav
                aria-label="Hình thức đặt"
                className="inline-flex min-h-9 items-center rounded-lg border bg-muted/30 p-1"
              >
                {enabledModes.map((item) => (
                  <Button
                    key={item}
                    asChild
                    size="sm"
                    variant="ghost"
                    className={cn(
                      'h-7 px-3 text-muted-foreground shadow-none',
                      item === mode && 'bg-background font-semibold text-foreground shadow-xs',
                    )}
                  >
                    <Link
                      to={calendarUrl(listing.id, month, item)}
                      aria-current={item === mode ? 'page' : undefined}
                    >
                      {item === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
                    </Link>
                  </Button>
                ))}
              </nav>
            ) : (
              <span className="inline-flex min-h-9 items-center gap-2 px-2 text-sm font-medium">
                <Clock3 className="size-4 text-primary" aria-hidden />
                {mode === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
              </span>
            )}

            {canEditCalendar ? (
              <Button
                size="sm"
                variant={rangeMode ? 'secondary' : 'default'}
                aria-pressed={rangeMode}
                onClick={() => {
                  setRangeMode((on) => !on);
                  setAnchor(null);
                  setRange(null);
                }}
              >
                <SquareDashedMousePointer className="size-4" aria-hidden /> Chọn nhiều ngày
              </Button>
            ) : null}

            {canAvailability ? (
              <Button asChild size="sm" variant="outline">
                <Link to={dashboardPaths.partner.listingHours(listing.id)}>
                  <Clock3 className="size-4" aria-hidden /> Lịch tuần
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {!canEditCalendar ? (
          <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
            Bạn đang xem lịch ở chế độ chỉ đọc vì không có quyền thay đổi lịch hoặc giá.
          </p>
        ) : null}
      </section>

      <SuccessBanner message={notice} />

      {rangeMode ? (
        <div
          className="flex flex-col gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {anchor ? '2' : '1'}
            </span>
            <div>
              <p className="font-medium">
                {anchor ? 'Chọn ngày cuối của dải' : 'Chọn ngày bắt đầu'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {anchor
                  ? `Ngày đầu: ${anchor.slice(8)}/${anchor.slice(5, 7)}. Bấm ngày cuối để tiếp tục.`
                  : 'Bạn có thể chọn một dải ngày liên tiếp để cập nhật cùng lúc.'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="self-start sm:self-center"
            onClick={() => {
              setRangeMode(false);
              setAnchor(null);
              setRange(null);
            }}
          >
            <X className="size-4" aria-hidden /> Hủy chọn
          </Button>
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

      {listing.bookingSelection === 'fixed_packages' ? (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Giá của tin đăng này được quản lý trong mục “Các gói dịch vụ”. Lịch giá riêng không áp
          dụng cho gói cố định.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Lịch tháng">
        <div className="flex flex-col gap-3 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <nav className="flex items-center justify-between gap-2" aria-label="Điều hướng tháng">
            <Button asChild variant="ghost" size="icon" aria-label="Tháng trước">
              <Link to={calendarUrl(listing.id, monthShift(month, -1), mode)}>
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <div className="min-w-36 text-center sm:min-w-40">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Lịch và giá
              </p>
              <h2 className="mt-0.5 font-semibold tabular-nums">
                Tháng {Number(month.slice(5))}/{month.slice(0, 4)}
              </h2>
            </div>
            <Button asChild variant="ghost" size="icon" aria-label="Tháng sau">
              <Link to={calendarUrl(listing.id, monthShift(month, 1), mode)}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </nav>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="text-left sm:text-right">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Giá cơ bản
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {basePrice ? <Money value={basePrice} /> : 'Chưa thiết lập'}
                {basePrice ? (
                  <span className="font-normal text-muted-foreground">
                    /{mode === 'hourly' ? 'giờ' : 'ngày'}
                  </span>
                ) : null}
              </p>
            </div>
            {month !== currentMonth ? (
              <Button asChild size="sm" variant="outline">
                <Link to={calendarUrl(listing.id, currentMonth, mode)}>Hôm nay</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {recurringRules.length > 0 ? (
          <div className="flex flex-col gap-3 border-b bg-primary/[0.035] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Repeat className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {recurringRules.length} quy tắc giá lặp lại đang áp dụng
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mode === 'hourly'
                    ? 'Ô có biểu tượng lặp hiển thị giá cơ bản; giá cuối phụ thuộc khung giờ.'
                    : 'Giá riêng của một ngày vẫn được ưu tiên hơn quy tắc theo tuần.'}
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="self-start text-primary sm:self-center"
            >
              <Link to={`${listingPath}?tab=pricing&mode=${mode}`}>
                Quản lý <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : null}

        <CalendarLegend />

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
                isToday={date === today}
                isSelected={date === anchor || (rangeDates.length > 0 && rangeDates.includes(date))}
                canEdit={canEditCalendar}
                onPick={pick}
              />
            ) : (
              <div
                key={`empty-${index}`}
                className="min-h-14 border-r border-b bg-muted/10 sm:min-h-24"
                aria-hidden
              />
            ),
          )}
        </div>
      </section>

      <DayDialog
        date={selected}
        mode={mode}
        basePrice={basePrice}
        weekdayOpen={selectedWeekdayOpen}
        openWindows={selected ? openWindowsFor(selected, weeklyRules, selectedException) : []}
        exception={selectedException}
        rules={selectedRules}
        bookings={selected ? (bookingsByDay.get(selected) ?? []) : []}
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
