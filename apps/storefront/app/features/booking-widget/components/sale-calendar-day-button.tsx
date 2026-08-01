import type { AvailabilityCalendarResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { CalendarDayButton } from '@booking/ui/components/ui/calendar';
import { cn } from '@booking/ui/lib/utils';
import { Flame } from 'lucide-react';
import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import { calendarDaysByDate } from '~/features/booking-widget/lib/sale-calendar';
import { localToDateOnly } from '~/lib/time';

interface SaleCalendarDayContextValue {
  days: ReturnType<typeof calendarDaysByDate>;
  allDayLabel: string;
  partialDayLabel: string;
  exactPercentLabel(percent: number): string;
}

const SaleCalendarDaysContext = createContext<SaleCalendarDayContextValue | undefined>(undefined);

export function SaleCalendarDayButtonProvider({
  calendar,
  children,
}: {
  calendar: AvailabilityCalendarResponse | null;
  children: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const value = useMemo<SaleCalendarDayContextValue>(
    () => ({
      days: calendarDaysByDate(calendar),
      allDayLabel: t('campaign.allDaySale'),
      partialDayLabel: t('campaign.partialDaySale'),
      exactPercentLabel: (percent) => t('campaign.exactPercent', { percent }),
    }),
    [calendar, t],
  );
  return (
    <SaleCalendarDaysContext.Provider value={value}>{children}</SaleCalendarDaysContext.Provider>
  );
}

export function SaleCalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: ComponentProps<typeof CalendarDayButton>) {
  const context = useContext(SaleCalendarDaysContext);
  const calendarDay = context?.days.get(localToDateOnly(day.date));
  const sale = calendarDay?.status === 'available' ? calendarDay.sale : null;
  const exactFullSale = Boolean(
    sale?.coverage === 'full' && sale.minDiscountPercent === sale.maxDiscountPercent,
  );
  const percentLabel = sale
    ? sale.minDiscountPercent === sale.maxDiscountPercent
      ? context?.exactPercentLabel(sale.minDiscountPercent)
      : `${sale.minDiscountPercent}–${sale.maxDiscountPercent}%`
    : null;
  const coverageLabel = sale
    ? sale.coverage === 'full'
      ? context?.allDayLabel
      : context?.partialDayLabel
    : null;
  const saleAriaLabel = coverageLabel && percentLabel ? `${coverageLabel}, ${percentLabel}` : null;

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      {...props}
      aria-label={[props['aria-label'], saleAriaLabel].filter(Boolean).join('. ') || undefined}
      className={cn(
        sale?.coverage === 'full' &&
          'border border-warning/50 bg-warning/15 text-warning-foreground',
        sale?.coverage === 'partial' &&
          'border border-warning/50 bg-warning/5 text-warning-foreground [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_5px,color-mix(in_oklch,var(--warning)_22%,transparent)_5px,color-mix(in_oklch,var(--warning)_22%,transparent)_8px)]',
        sale &&
          'data-[range-end=true]:ring-2 data-[range-end=true]:ring-primary data-[range-middle=true]:ring-2 data-[range-middle=true]:ring-primary data-[range-start=true]:ring-2 data-[range-start=true]:ring-primary data-[selected-single=true]:ring-2 data-[selected-single=true]:ring-primary [&>span]:text-[9px]',
        className,
      )}
    >
      {props.children}
      {sale ? (
        exactFullSale ? (
          <span className="font-semibold" aria-hidden="true">
            −{sale.minDiscountPercent}%
          </span>
        ) : (
          <Flame className="size-3 fill-current" aria-hidden="true" />
        )
      ) : null}
    </CalendarDayButton>
  );
}
