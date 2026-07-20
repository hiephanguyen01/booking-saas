import type { HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import { AlertCircle, CalendarDays, Check, Clock3, RotateCw, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { PendingLink } from '../../../components/pending-link';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import {
  DEFAULT_TZ,
  dateLabelInTz,
  dateOnlyToLocal,
  localToDateOnly,
  todayInTz,
} from '../../../lib/time';
import { formatVnd } from '../../../lib/ui';
import { useLocale } from '../../../lib/use-locale';
import type { loader as bookingDataLoader } from '../../../routes/listing-group-booking-data';
import type { BookingMode, RoomOption } from '../listing-group-types';
import {
  atomicHourlySlots,
  checkoutHref,
  slotInterval,
  toggleContiguousSlot,
} from '../listing-group-utils';

type RoomBookingMode = 'hourly' | 'daily';
type BookingRequestKind = 'availability' | 'quote';
type DateRange = { from: Date | undefined; to?: Date | undefined };

const DAY_MS = 24 * 60 * 60 * 1000;

export function RoomBookingDialog({
  option,
  groupSlug,
  preferredMode,
}: {
  option: RoomOption;
  groupSlug: string;
  preferredMode: BookingMode;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const fetcher = useFetcher<typeof bookingDataLoader>();
  const supportedModes = option.detail.bookingModes.filter(
    (item): item is RoomBookingMode => item === 'hourly' || item === 'daily',
  );
  const initialMode = supportedModes.includes(preferredMode as RoomBookingMode)
    ? (preferredMode as RoomBookingMode)
    : (supportedModes[0] ?? 'hourly');
  const today = todayInTz(DEFAULT_TZ);
  const todayDate = dateOnlyToLocal(today);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<RoomBookingMode>(initialMode);
  const [date, setDate] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<HourlySlot[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [requestKind, setRequestKind] = useState<BookingRequestKind>('availability');
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const basePath = `/${locale}/g/${encodeURIComponent(groupSlug)}/rooms/${encodeURIComponent(option.child.slug)}/booking-data`;

  function load(
    next: {
      mode: RoomBookingMode;
      date?: string;
      from?: string | null;
      to?: string | null;
      start?: string;
      end?: string;
    },
    kind: BookingRequestKind,
  ): void {
    setRequestKind(kind);
    const params = new URLSearchParams({ mode: next.mode });
    if (next.mode === 'hourly' && next.date) params.set('date', next.date);
    if (next.mode === 'daily' && next.from) params.set('from', next.from);
    if (next.mode === 'daily' && next.to) params.set('to', next.to);
    if (next.start && next.end) {
      params.set('start', next.start);
      params.set('end', next.end);
    }
    void fetcher.load(`${basePath}?${params.toString()}`);
  }

  function handleOpen(next: boolean, target: 'desktop' | 'mobile'): void {
    if (target === 'desktop') setDesktopOpen(next);
    else setMobileOpen(next);
    if (!next) return;

    if (mode === 'hourly' && date) {
      const draftInterval = slotInterval(selectedSlots);
      load(
        {
          mode,
          date,
          start: draftInterval?.start,
          end: draftInterval?.end,
        },
        draftInterval ? 'quote' : 'availability',
      );
    } else if (mode === 'daily') {
      load({ mode, from: from ?? today, to }, from && to ? 'quote' : 'availability');
    }
  }

  function switchMode(next: RoomBookingMode): void {
    if (next === mode) return;
    setMode(next);
    setDate(null);
    setFrom(null);
    setTo(null);
    setSelectedSlots([]);
    setSelectionError('');
    if (next === 'daily') load({ mode: next, from: today }, 'availability');
  }

  const response = fetcher.data;
  const currentData =
    response?.ok &&
    response.mode === mode &&
    (mode === 'hourly'
      ? response.date === date
      : response.from === (from ?? today) && response.to === to)
      ? response
      : null;
  const availability =
    currentData?.availability ??
    (mode === 'daily' && response?.ok && response.mode === 'daily' ? response.availability : null);
  const slots = useMemo(
    () =>
      availability?.mode === 'hourly'
        ? atomicHourlySlots(availability.days.flatMap((day) => day.slots))
        : [],
    [availability],
  );
  const openDates = useMemo(
    () =>
      new Set(
        availability?.mode === 'daily'
          ? availability.days.filter((day) => day.status === 'available').map((day) => day.date)
          : [],
      ),
    [availability],
  );
  const dailyEndDate = useMemo(() => {
    if (availability?.mode !== 'daily' || availability.days.length === 0) return undefined;
    let latest = availability.days[0].date;
    for (const day of availability.days) {
      if (day.date > latest) latest = day.date;
    }
    return dateOnlyToLocal(latest);
  }, [availability]);
  const dailySoldOut = availability?.mode === 'daily' && openDates.size === 0;
  const interval = slotInterval(selectedSlots);
  const selectionMatches = Boolean(
    currentData?.selectionStart &&
    currentData.selectionEnd &&
    (mode === 'daily' ||
      (interval?.start === currentData.selectionStart &&
        interval.end === currentData.selectionEnd)),
  );
  const hasCompleteSelection = mode === 'hourly' ? Boolean(interval) : Boolean(from && to);
  const availabilityPending = fetcher.state !== 'idle' && requestKind === 'availability';
  const quotePending = fetcher.state !== 'idle' && requestKind === 'quote';
  const requestError = fetcher.state === 'idle' && response && !response.ok;
  const selectionUnavailable = Boolean(
    hasCompleteSelection && fetcher.state === 'idle' && currentData && !currentData.quote,
  );
  const quote = selectionMatches ? currentData?.quote : null;
  const canBook = Boolean(fetcher.state === 'idle' && selectionMatches && quote);
  const bookingHref =
    canBook && currentData?.selectionStart && currentData.selectionEnd
      ? checkoutHref({
          locale,
          listingSlug: option.child.slug,
          mode,
          start: currentData.selectionStart,
          end: currentData.selectionEnd,
        })
      : null;

  function selectDate(nextDate: string): void {
    setDate(nextDate);
    setSelectedSlots([]);
    setSelectionError('');
    load({ mode: 'hourly', date: nextDate }, 'availability');
  }

  function changeDate(): void {
    setDate(null);
    setSelectedSlots([]);
    setSelectionError('');
  }

  function toggleSlot(slot: HourlySlot): void {
    if (!slot.available || !date) return;
    const result = toggleContiguousSlot(selectedSlots, slot);
    if (!result.changed) {
      setSelectionError(t('group.contiguousOnly'));
      return;
    }

    setSelectedSlots(result.slots);
    setSelectionError('');
    const nextInterval = slotInterval(result.slots);
    if (nextInterval) {
      load(
        {
          mode: 'hourly',
          date,
          start: nextInterval.start,
          end: nextInterval.end,
        },
        'quote',
      );
    }
  }

  function selectRange(next: DateRange | undefined): void {
    const nextFrom = next?.from ? localToDateOnly(next.from) : null;
    const nextTo = next?.to ? localToDateOnly(next.to) : null;
    setFrom(nextFrom);
    setTo(nextTo);
    setSelectionError('');
    if (nextFrom && nextTo) {
      load({ mode: 'daily', from: nextFrom, to: nextTo }, 'quote');
    }
  }

  const calendarA11y = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const fullDate = new Intl.DateTimeFormat(tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      formatters: {
        formatCaption: (month: Date) => caption.format(month),
        formatWeekdayName: (day: Date) =>
          locale === 'en'
            ? new Intl.DateTimeFormat(tag, { weekday: 'narrow' }).format(day)
            : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][day.getDay()],
      },
      labels: {
        labelDayButton: (day: Date) => fullDate.format(day),
        labelGrid: (month?: Date) =>
          t('group.calendarLabel', { month: month ? caption.format(month) : '' }),
        labelNav: () => t('group.calendarNavigation'),
        labelPrevious: () => t('group.previousMonth'),
        labelNext: () => t('group.nextMonth'),
      },
    };
  }, [locale, t]);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: availability?.timezone ?? DEFAULT_TZ,
      }),
    [availability?.timezone, locale],
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { maximumFractionDigits: 1 }),
    [locale],
  );
  const selectionSummary = useMemo(() => {
    if (mode === 'hourly' && date && interval) {
      const duration = (Date.parse(interval.end) - Date.parse(interval.start)) / (60 * 60 * 1000);
      return `${dateLabelInTz(date, DEFAULT_TZ, locale)} · ${timeFormatter.format(new Date(interval.start))}–${timeFormatter.format(new Date(interval.end))} · ${t('hours', { count: numberFormatter.format(duration) })}`;
    }
    if (mode === 'daily' && from && to) {
      const duration = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
      return `${dateLabelInTz(from, DEFAULT_TZ, locale)} – ${dateLabelInTz(to, DEFAULT_TZ, locale)} · ${t('nights', { count: numberFormatter.format(duration) })}`;
    }
    return null;
  }, [date, from, interval, locale, mode, numberFormatter, t, timeFormatter, to]);

  const trigger = (
    <Button className="w-full">
      <CalendarDays aria-hidden="true" /> {t('group.chooseSchedule')}
    </Button>
  );
  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {supportedModes.length > 1 ? (
        <div
          role="group"
          aria-label={t('mode')}
          className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1"
        >
          {supportedModes.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === mode}
              onClick={() => switchMode(item)}
              className={cn(
                'min-h-11 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item === mode ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item === 'hourly' ? t('modeHourly') : t('modeDaily')}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'hourly' ? (
        date ? (
          <section aria-labelledby="room-hourly-step-title" className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="room-hourly-step-title" className="font-semibold">
                  {t('pickSlot')}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateLabelInTz(date, DEFAULT_TZ, locale)} · {t('group.hourlyInstruction')}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={changeDate}
              >
                <CalendarDays aria-hidden="true" /> {t('group.changeDay')}
              </Button>
            </div>

            {availabilityPending && !availability ? (
              <AvailabilitySkeleton label={t('group.loadingAvailability')} />
            ) : requestError ? (
              <ErrorMessage onRetry={() => load({ mode, date }, 'availability')} />
            ) : slots.length ? (
              <div className="grid grid-cols-2 gap-2" aria-busy={quotePending}>
                {slots.map((slot) => {
                  const selected = selectedSlots.some((item) => item.startUtc === slot.startUtc);
                  const startLabel = timeFormatter.format(new Date(slot.startUtc));
                  const endLabel = timeFormatter.format(new Date(slot.endUtc));
                  return (
                    <button
                      key={`${slot.startUtc}:${slot.endUtc}`}
                      type="button"
                      aria-pressed={selected}
                      disabled={!slot.available || quotePending}
                      onClick={() => toggleSlot(slot)}
                      className={cn(
                        'min-h-14 rounded-md border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected && 'border-primary bg-primary/10 text-primary',
                        !slot.available && 'cursor-not-allowed bg-muted opacity-60',
                        quotePending && 'cursor-wait',
                      )}
                    >
                      <span className="flex items-center justify-center gap-1 font-medium">
                        {selected ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Clock3 className="size-3.5" aria-hidden="true" />
                        )}
                        {startLabel}–{endLabel}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {slot.available ? formatVnd(slot.price) : t('group.unavailableSlot')}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyAvailability message={t('group.noOpenSlots')} />
            )}
          </section>
        ) : (
          <section aria-labelledby="room-day-step-title">
            <h3 id="room-day-step-title" className="font-semibold">
              {t('pickDay')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('group.pickDayInstruction')}</p>
            <Calendar
              fullWidth
              mode="single"
              selected={undefined}
              onSelect={(day) => {
                if (day) selectDate(localToDateOnly(day));
              }}
              disabled={{ before: todayDate }}
              startMonth={todayDate}
              defaultMonth={todayDate}
              showOutsideDays={false}
              fixedWeeks
              formatters={calendarA11y.formatters}
              labels={calendarA11y.labels}
              className="sf-calendar mx-auto mt-3 [--cell-size:2.75rem]"
            />
          </section>
        )
      ) : (
        <section aria-labelledby="room-range-step-title" aria-busy={availabilityPending}>
          <h3 id="room-range-step-title" className="font-semibold">
            {t('selectRange')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('group.dailyInstruction')}</p>
          {requestError ? (
            <div className="mt-4">
              <ErrorMessage
                onRetry={() =>
                  load({ mode, from: from ?? today, to }, from && to ? 'quote' : 'availability')
                }
              />
            </div>
          ) : dailySoldOut ? (
            <div className="mt-4">
              <EmptyAvailability message={t('group.soldOut')} />
            </div>
          ) : (
            <div className="relative mt-3">
              <Calendar
                fullWidth
                connectedRange
                mode="range"
                numberOfMonths={1}
                selected={
                  from
                    ? {
                        from: dateOnlyToLocal(from),
                        to: to ? dateOnlyToLocal(to) : undefined,
                      }
                    : undefined
                }
                onSelect={selectRange}
                disabled={(day) =>
                  day < todayDate ||
                  availabilityPending ||
                  (availability?.mode === 'daily' && !openDates.has(localToDateOnly(day)))
                }
                startMonth={todayDate}
                endMonth={dailyEndDate}
                excludeDisabled
                resetOnSelect
                showOutsideDays={false}
                fixedWeeks
                defaultMonth={dateOnlyToLocal(from ?? today)}
                formatters={calendarA11y.formatters}
                labels={calendarA11y.labels}
                className="sf-calendar mx-auto [--cell-size:2.75rem]"
              />
              {availabilityPending ? (
                <div
                  className="absolute inset-0 grid place-items-center rounded-lg bg-background/75"
                  role="status"
                  aria-live="polite"
                >
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner aria-hidden="true" /> {t('group.loadingAvailability')}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}

      {selectionError ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {selectionError}
        </p>
      ) : null}
      {selectionUnavailable ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {mode === 'hourly' ? t('selectedSlotUnavailable') : t('unavailableRange')}
        </p>
      ) : null}
    </div>
  );
  const footer = (
    <BookingFooter
      mode={mode}
      date={date}
      selectionSummary={selectionSummary}
      quote={quote?.subtotal ?? null}
      quotePending={quotePending}
      bookingHref={bookingHref}
    />
  );

  return (
    <>
      <div className="hidden lg:block">
        <Dialog open={desktopOpen} onOpenChange={(next) => handleOpen(next, 'desktop')}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              dialogTitleRef.current?.focus();
            }}
            className="flex max-h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-146"
          >
            <DialogHeader className="shrink-0 border-b p-5 pr-16">
              <DialogTitle ref={dialogTitleRef} tabIndex={-1} className="outline-none">
                {t('group.chooseSchedule')}
              </DialogTitle>
              <DialogDescription>{option.child.title}</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-11"
                aria-label={t('group.closeSchedule')}
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
            {body}
            {footer}
          </DialogContent>
        </Dialog>
      </div>
      <div className="lg:hidden">
        <Drawer open={mobileOpen} onOpenChange={(next) => handleOpen(next, 'mobile')}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="h-[92dvh] max-h-[92dvh]! overflow-hidden">
            <DrawerHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-16 text-left">
              <DrawerTitle>{t('group.chooseSchedule')}</DrawerTitle>
              <DrawerDescription>{option.child.title}</DrawerDescription>
            </DrawerHeader>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-11"
                aria-label={t('group.closeSchedule')}
              >
                <X aria-hidden="true" />
              </Button>
            </DrawerClose>
            {body}
            {footer}
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function BookingFooter({
  mode,
  date,
  selectionSummary,
  quote,
  quotePending,
  bookingHref,
}: {
  mode: RoomBookingMode;
  date: string | null;
  selectionSummary: string | null;
  quote: string | null;
  quotePending: boolean;
  bookingHref: string | null;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const disabledLabel = quotePending
    ? t('group.calculatingPrice')
    : mode === 'hourly'
      ? date
        ? t('group.chooseHoursToContinue')
        : t('group.chooseDayToContinue')
      : t('group.chooseRangeToContinue');

  return (
    <div className="shrink-0 border-t bg-card px-5 py-4 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.35)]">
      <div aria-live="polite" aria-atomic="true">
        {selectionSummary ? (
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('group.selectedSchedule')}</p>
              <p className="mt-0.5 truncate text-sm font-medium">{selectionSummary}</p>
            </div>
            {quote !== null ? (
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">{t('subtotalEstimate')}</p>
                <strong className="text-lg text-primary">{formatVnd(quote)}</strong>
              </div>
            ) : quotePending ? (
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden="true" /> {t('group.calculatingPrice')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {bookingHref ? (
        <PendingLink
          to={bookingHref}
          size="control"
          className={cn('w-full', selectionSummary && 'mt-3')}
          pendingLabel={t('group.navigating')}
        >
          {t('bookNow')}
        </PendingLink>
      ) : (
        <Button disabled size="control" className={cn('w-full', selectionSummary && 'mt-3')}>
          {quotePending ? <Spinner aria-hidden="true" /> : null}
          {disabledLabel}
        </Button>
      )}
    </div>
  );
}

function AvailabilitySkeleton({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function EmptyAvailability({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function ErrorMessage({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t('group.availabilityError')}
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
        <RotateCw aria-hidden="true" /> {t('group.retry')}
      </Button>
    </div>
  );
}
