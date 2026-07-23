import type { HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { cn } from '@booking/ui/lib/utils';
import { AlertCircle, CalendarDays, Check, Clock3, RotateCw } from 'lucide-react';
import { useMemo } from 'react';
import { AvailabilitySkeleton } from '../../components/loading-skeletons';
import { NsI18n, useTranslation } from '../../lib/i18n';
import {
  DEFAULT_TZ,
  dateLabelInTz,
  dateOnlyToLocal,
  localToDateOnly,
  todayInTz,
} from '../../lib/time';
import { formatVnd } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';

export function PackageBookingDialogSteps({
  date,
  timezone,
  availabilityPending,
  hasAvailability,
  availabilityError,
  slots,
  selectedSlots,
  quotePending,
  quoteError,
  selectionUnavailable,
  onSelectDate,
  onChangeDate,
  onToggleSlot,
  onRetryAvailability,
  onRetryQuote,
}: {
  date: string | null;
  timezone: string;
  availabilityPending: boolean;
  hasAvailability: boolean;
  availabilityError: boolean;
  slots: HourlySlot[];
  selectedSlots: HourlySlot[];
  quotePending: boolean;
  quoteError: boolean;
  selectionUnavailable: boolean;
  onSelectDate: (date: string) => void;
  onChangeDate: () => void;
  onToggleSlot: (slot: HourlySlot) => void;
  onRetryAvailability: () => void;
  onRetryQuote: () => void;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const todayDate = dateOnlyToLocal(todayInTz(DEFAULT_TZ));
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
      }),
    [locale, timezone],
  );
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

  return (
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
              onClick={onChangeDate}
            >
              <CalendarDays aria-hidden="true" /> {t('group.changeDay')}
            </Button>
          </div>

          {availabilityPending && !hasAvailability ? (
            <AvailabilitySkeleton label={t('common:loading')} />
          ) : availabilityError ? (
            <PackageBookingErrorMessage onRetry={onRetryAvailability} />
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
                    onClick={() => onToggleSlot(slot)}
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

          {quoteError ? <PackageBookingErrorMessage onRetry={onRetryQuote} /> : null}
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
              if (day) onSelectDate(localToDateOnly(day));
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
}

function PackageBookingErrorMessage({ onRetry }: { onRetry: () => void }) {
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
