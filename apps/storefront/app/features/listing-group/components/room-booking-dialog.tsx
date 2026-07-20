import type { HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { cn } from '@booking/ui/lib/utils';
import { CalendarDays, ChevronDown, Clock3, RotateCw } from 'lucide-react';
import { useMemo, useState } from 'react';
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
    (mode): mode is RoomBookingMode => mode === 'hourly' || mode === 'daily',
  );
  const initialMode = supportedModes.includes(preferredMode as RoomBookingMode)
    ? (preferredMode as RoomBookingMode)
    : (supportedModes[0] ?? 'hourly');
  const today = todayInTz(DEFAULT_TZ);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<RoomBookingMode>(initialMode);
  const [date, setDate] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<HourlySlot[]>([]);
  const [hourlyCalendarOpen, setHourlyCalendarOpen] = useState(false);
  const [requestKind, setRequestKind] = useState<BookingRequestKind>('availability');
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

  function resetAndLoad(): void {
    setMode(initialMode);
    setDate(null);
    setFrom(null);
    setTo(null);
    setSelectedSlots([]);
    setHourlyCalendarOpen(false);
    if (initialMode === 'daily') load({ mode: initialMode, from: today }, 'availability');
  }

  function handleOpen(next: boolean, target: 'desktop' | 'mobile'): void {
    if (target === 'desktop') setDesktopOpen(next);
    else setMobileOpen(next);
    if (next) resetAndLoad();
  }

  function switchMode(next: RoomBookingMode): void {
    setMode(next);
    setSelectedSlots([]);
    setFrom(null);
    setTo(null);
    setDate(null);
    setHourlyCalendarOpen(false);
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
    (mode === 'daily' && response?.ok && response.mode === 'daily'
      ? response.availability
      : null);
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
          ? availability.days
              .filter((day) => day.status === 'available')
              .map((day) => day.date)
          : [],
      ),
    [availability],
  );
  const interval = slotInterval(selectedSlots);
  const selectionMatches =
    currentData?.selectionStart &&
    currentData.selectionEnd &&
    (mode === 'daily' ||
      (interval?.start === currentData.selectionStart && interval.end === currentData.selectionEnd));
  const hasCompleteSelection = mode === 'hourly' ? Boolean(interval) : Boolean(from && to);
  const availabilityPending = fetcher.state !== 'idle' && requestKind === 'availability';
  const canBook = Boolean(
    fetcher.state === 'idle' && selectionMatches && currentData?.quote,
  );
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
    setHourlyCalendarOpen(false);
    load({ mode: 'hourly', date: nextDate }, 'availability');
  }

  function toggleSlot(slot: HourlySlot): void {
    if (!slot.available || !date) return;
    const result = toggleContiguousSlot(selectedSlots, slot);
    if (!result.changed) return;
    setSelectedSlots(result.slots);
    const nextInterval = slotInterval(result.slots);
    load(
      {
        mode: 'hourly',
        date,
        start: nextInterval?.start,
        end: nextInterval?.end,
      },
      'quote',
    );
  }

  function selectRange(next: DateRange | undefined): void {
    const nextFrom = next?.from ? localToDateOnly(next.from) : null;
    const nextTo = next?.to ? localToDateOnly(next.to) : null;
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo) {
      load({ mode: 'daily', from: nextFrom, to: nextTo }, 'quote');
    }
  }

  const trigger = (
    <Button className="w-full">
      <CalendarDays /> {t('group.chooseSchedule')}
    </Button>
  );
  const calendarFormatters = useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (day: Date) => weekday.format(day),
    };
  }, [locale]);
  const content = (
    <div className="flex flex-col gap-5 p-5">
      {supportedModes.length > 1 ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
          {supportedModes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => switchMode(item)}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item === mode ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              {item === 'hourly' ? t('modeHourly') : t('modeDaily')}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'hourly' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('pickDay')}</span>
            <Popover open={hourlyCalendarOpen} onOpenChange={setHourlyCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <CalendarDays />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {date ? dateLabelInTz(date, DEFAULT_TZ, locale) : t('pickDay')}
                  </span>
                  <ChevronDown />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date ? dateOnlyToLocal(date) : undefined}
                  onSelect={(day) => {
                    if (day) selectDate(localToDateOnly(day));
                  }}
                  disabled={{ before: dateOnlyToLocal(today) }}
                  defaultMonth={dateOnlyToLocal(date ?? today)}
                  formatters={calendarFormatters}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="h-64" aria-busy={availabilityPending}>
            {!date ? (
              <p className="grid size-full place-items-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('pickDayFirst')}
              </p>
            ) : availabilityPending && !availability ? null : response && !response.ok ? (
              <div className="grid size-full place-items-center">
                <ErrorMessage onRetry={() => load({ mode, date }, 'availability')} />
              </div>
            ) : slots.length ? (
              <div className="grid size-full grid-cols-2 gap-2 overflow-y-auto pr-1">
                {slots.map((slot) => {
                  const selected = selectedSlots.some((item) => item.startUtc === slot.startUtc);
                  return (
                    <button
                      key={`${slot.startUtc}:${slot.endUtc}`}
                      type="button"
                      disabled={!slot.available || fetcher.state !== 'idle'}
                      onClick={() => toggleSlot(slot)}
                      className={cn(
                        'rounded-md border px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected && 'border-primary bg-primary/10 text-primary',
                        !slot.available && 'cursor-not-allowed bg-muted opacity-50',
                        fetcher.state !== 'idle' && 'cursor-wait',
                      )}
                    >
                      <span className="flex items-center justify-center gap-1">
                        <Clock3 className="size-3.5" />
                        {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                          timeZone: availability?.timezone ?? DEFAULT_TZ,
                        }).format(new Date(slot.startUtc))}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {slot.available ? formatVnd(slot.price) : t('group.unavailableSlot')}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="grid size-full place-items-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('group.noOpenSlots')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-80 flex-col gap-3" aria-busy={fetcher.state !== 'idle'}>
          {response && !response.ok ? (
            <ErrorMessage
              onRetry={() =>
                load(
                  { mode, from: from ?? today, to },
                  from && to ? 'quote' : 'availability',
                )
              }
            />
          ) : (
            <Calendar
              mode="range"
              numberOfMonths={2}
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
                day < dateOnlyToLocal(today) ||
                (openDates.size > 0 && !openDates.has(localToDateOnly(day)))
              }
              excludeDisabled
              resetOnSelect
              defaultMonth={dateOnlyToLocal(from ?? today)}
              formatters={calendarFormatters}
              className="sf-calendar mx-auto [--cell-size:2.25rem]"
            />
          )}
        </div>
      )}

      <div className="min-h-14">
        {currentData?.quote ? (
          <div className="rounded-md bg-muted/60 px-4 py-3 text-right text-sm">
            {t('subtotalEstimate')}{' '}
            <strong className="text-lg text-primary">{formatVnd(currentData.quote.subtotal)}</strong>
          </div>
        ) : null}
      </div>
      {bookingHref ? (
        <PendingLink to={bookingHref} className="w-full" pendingLabel={t('group.navigating')}>
          {t('bookNow')}
        </PendingLink>
      ) : (
        <Button disabled className="w-full">
          {hasCompleteSelection ? t('bookNow') : t('selectToContinue')}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className="hidden lg:block">
        <Dialog open={desktopOpen} onOpenChange={(next) => handleOpen(next, 'desktop')}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-146">
            <DialogHeader className="border-b p-5 pr-12">
              <DialogTitle>{t('group.chooseSchedule')}</DialogTitle>
              <DialogDescription>{option.child.title}</DialogDescription>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      </div>
      <div className="lg:hidden">
        <Drawer open={mobileOpen} onOpenChange={(next) => handleOpen(next, 'mobile')}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t('group.chooseSchedule')}</DrawerTitle>
              <DrawerDescription>{option.child.title}</DrawerDescription>
            </DrawerHeader>
            <div className="max-h-[75vh] overflow-y-auto">{content}</div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function ErrorMessage({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">{t('group.availabilityError')}</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCw /> {t('group.retry')}
      </Button>
    </div>
  );
}
