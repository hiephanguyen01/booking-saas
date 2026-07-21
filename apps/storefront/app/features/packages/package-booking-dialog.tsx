import type {
  AvailabilityResponse,
  HourlySlot,
  PublicListingDetailResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@booking/ui/components/ui/drawer';
import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { cn } from '@booking/ui/lib/utils';
import { AlertCircle, CalendarDays, Check, Clock3, RotateCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFetcher } from 'react-router';
import { BookingDialogFooter } from '../../components/booking-dialog-footer';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { PublicPackageOption } from '../../lib/package-options';
import {
  DEFAULT_TZ,
  dateLabelInTz,
  dateOnlyToLocal,
  localToDateOnly,
  todayInTz,
} from '../../lib/time';
import { formatVnd } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import type { loader as bookingDataLoader } from '../../routes/listing-booking-data';
import { checkoutHref, slotInterval } from '../listing-group/listing-group-utils';

type BookingRequestKind = 'availability' | 'quote';

export function PackageBookingDialog({
  open,
  onOpenChange,
  returnFocusRef,
  selectedPackage,
  listing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  selectedPackage: PublicPackageOption | null;
  listing: PublicListingDetailResponse;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const fetcher = useFetcher<typeof bookingDataLoader>();
  const isDesktop = useDesktopBookingDialog();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [date, setDate] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<HourlySlot[]>([]);
  const [cachedAvailability, setCachedAvailability] = useState<AvailabilityResponse | null>(null);
  const [requestKind, setRequestKind] = useState<BookingRequestKind>('availability');
  const today = todayInTz(DEFAULT_TZ);
  const todayDate = dateOnlyToLocal(today);
  const packageId = selectedPackage?.id ?? null;
  const basePath = `/${locale}/l/${encodeURIComponent(listing.slug)}/booking-data`;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isDesktop, open]);

  function load(
    next: { date: string; start?: string; end?: string },
    kind: BookingRequestKind,
  ): void {
    if (!packageId) return;
    setRequestKind(kind);
    const params = new URLSearchParams({
      mode: 'hourly',
      date: next.date,
      packageId,
    });
    if (next.start && next.end) {
      params.set('start', next.start);
      params.set('end', next.end);
    }
    void fetcher.load(`${basePath}?${params.toString()}`);
  }

  function resetSelection(): void {
    setDate(null);
    setSelectedSlots([]);
    setCachedAvailability(null);
    setRequestKind('availability');
  }

  function changeOpen(next: boolean): void {
    if (!next) resetSelection();
    onOpenChange(next);
    if (!next) requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function selectDate(nextDate: string): void {
    setDate(nextDate);
    setSelectedSlots([]);
    setCachedAvailability(null);
    load({ date: nextDate }, 'availability');
  }

  function changeDate(): void {
    setDate(null);
    setSelectedSlots([]);
    setCachedAvailability(null);
  }

  function toggleSlot(slot: HourlySlot): void {
    if (!slot.available || !date) return;
    const selected = selectedSlots.some(
      (item) => item.startUtc === slot.startUtc && item.endUtc === slot.endUtc,
    );
    const nextSlots = selected ? [] : [slot];
    setSelectedSlots(nextSlots);
    if (!selected) {
      load({ date, start: slot.startUtc, end: slot.endUtc }, 'quote');
    }
  }

  const response = fetcher.data;
  const currentData =
    response?.ok &&
    response.mode === 'hourly' &&
    response.date === date &&
    response.packageId === packageId
      ? response
      : null;
  useEffect(() => {
    if (currentData?.availability) setCachedAvailability(currentData.availability);
  }, [currentData]);
  const availability = currentData?.availability ?? cachedAvailability;
  const slots = useMemo(
    () => (availability?.mode === 'hourly' ? availability.days.flatMap((day) => day.slots) : []),
    [availability],
  );
  const interval = slotInterval(selectedSlots);
  const selectionMatches = Boolean(
    interval &&
    currentData?.selectionStart === interval.start &&
    currentData.selectionEnd === interval.end,
  );
  const quote = selectionMatches ? currentData?.quote : null;
  const availabilityPending = fetcher.state !== 'idle' && requestKind === 'availability';
  const quotePending = fetcher.state !== 'idle' && requestKind === 'quote' && Boolean(interval);
  const requestError = fetcher.state === 'idle' && response && !response.ok;
  const availabilityError = requestError && requestKind === 'availability';
  const quoteError = requestError && requestKind === 'quote' && Boolean(interval);
  const selectionUnavailable = Boolean(
    interval && fetcher.state === 'idle' && currentData && !selectionMatches && !currentData.quote,
  );
  const canBook = Boolean(fetcher.state === 'idle' && selectionMatches && quote);
  const bookingHref =
    canBook && currentData?.selectionStart && currentData.selectionEnd && packageId
      ? checkoutHref({
          locale,
          listingSlug: listing.slug,
          mode: 'hourly',
          start: currentData.selectionStart,
          end: currentData.selectionEnd,
          packageId,
        })
      : null;

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
    if (!date || !interval) return null;
    const duration = (Date.parse(interval.end) - Date.parse(interval.start)) / (60 * 60 * 1000);
    return `${dateLabelInTz(date, DEFAULT_TZ, locale)} · ${timeFormatter.format(new Date(interval.start))}–${timeFormatter.format(new Date(interval.end))} · ${t('hours', { count: numberFormatter.format(duration) })}`;
  }, [date, interval, locale, numberFormatter, t, timeFormatter]);

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

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {date ? (
        <section aria-labelledby="packages-hourly-step-title" className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="packages-hourly-step-title" className="font-semibold">
                {t('pickSlot')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {dateLabelInTz(date, DEFAULT_TZ, locale)} · {t('packages.hourlyInstruction')}
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
          ) : availabilityError ? (
            <ErrorMessage onRetry={() => load({ date }, 'availability')} />
          ) : slots.length ? (
            <div className="grid grid-cols-2 gap-2" aria-busy={quotePending}>
              {slots.map((slot) => {
                const selected = selectedSlots.some(
                  (item) => item.startUtc === slot.startUtc && item.endUtc === slot.endUtc,
                );
                const startLabel = timeFormatter.format(new Date(slot.startUtc));
                const endLabel = timeFormatter.format(new Date(slot.endUtc));
                return (
                  <button
                    key={`${slot.startUtc}:${slot.endUtc}`}
                    type="button"
                    aria-pressed={selected}
                    disabled={!slot.available}
                    onClick={() => toggleSlot(slot)}
                    className={cn(
                      'min-h-14 rounded-md border px-2 py-2 text-sm transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'border-primary bg-primary/10 text-primary',
                      !slot.available && 'cursor-not-allowed bg-muted opacity-60',
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
            <p className="rounded-md border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
              {t('group.noOpenSlots')}
            </p>
          )}

          {quoteError ? (
            <ErrorMessage
              onRetry={() => {
                if (interval) load({ date, start: interval.start, end: interval.end }, 'quote');
              }}
            />
          ) : null}
          {selectionUnavailable ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('selectedSlotUnavailable')}
            </p>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="packages-day-step-title">
          <h3 id="packages-day-step-title" className="font-semibold">
            {t('pickDay')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('packages.pickDayInstruction')}</p>
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
      )}
    </div>
  );

  const footer = (
    <BookingDialogFooter
      selectionSummary={selectionSummary}
      quote={quote?.subtotal ?? null}
      quotePending={quotePending}
      bookingHref={bookingHref}
      disabledLabel={
        quotePending
          ? t('group.calculatingPrice')
          : date
            ? t('group.chooseHoursToContinue')
            : t('group.chooseDayToContinue')
      }
    />
  );
  const title = t('packages.bookingTitle', {
    name: selectedPackage?.name ?? listing.title,
  });

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-146"
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-16">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              {title}
            </DialogTitle>
            <DialogDescription>{t('packages.bookingDescription')}</DialogDescription>
          </DialogHeader>
          <CloseButton onClick={() => changeOpen(false)} />
          {body}
          {footer}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <DrawerContent className="h-[92dvh] max-h-[92dvh]! overflow-hidden">
        <DrawerHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-16 text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {title}
          </DrawerTitle>
          <DrawerDescription>{t('packages.bookingDescription')}</DrawerDescription>
        </DrawerHeader>
        <CloseButton onClick={() => changeOpen(false)} />
        {body}
        {footer}
      </DrawerContent>
    </Drawer>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-3 right-3 size-11"
      aria-label={t('group.closeSchedule')}
      onClick={onClick}
    >
      <X aria-hidden="true" />
    </Button>
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

function useDesktopBookingDialog(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
