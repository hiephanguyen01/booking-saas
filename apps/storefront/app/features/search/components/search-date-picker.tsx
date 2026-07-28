import { Calendar } from '@booking/ui/components/ui/calendar';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { CalendarDays, ChevronDown, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useLocale } from '~/hooks/use-locale';
import { ModeToggle } from './search-form-controls';
import type { DateRange } from '~/features/search/lib/search-form-types';
import { modeHint } from '~/features/search/lib/search-mode-hint';
import type { SearchMode } from '~/features/search/lib/search-state';
import { useSearchDatePickerController } from '~/features/search/hooks/use-search-date-picker-controller';

export function SearchDatePicker({
  mode,
  onModeChange,
  date,
  setDate,
  range,
  setRange,
  showModeTabs,
  availableModes,
  singleDate,
}: {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  date: string;
  setDate: (value: string) => void;
  range: DateRange;
  setRange: (value: DateRange) => void;
  showModeTabs: boolean;
  availableModes: SearchMode[];
  singleDate: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locale = useLocale();
  const {
    calendarToday,
    drawerOpen,
    formatters,
    label,
    popoverOpen,
    selectDateRange,
    selectSingleDate,
    selectedDate,
    setDrawerOpen,
    setPopoverOpen,
    singleMode,
  } = useSearchDatePickerController({
    mode,
    date,
    setDate,
    range,
    setRange,
    singleDate,
    locale,
    pickDateLabel: t('home.pickDate'),
    endDateLabel: t('home.endDate'),
  });
  const description = modeHint(mode, t);
  const trigger = (
    <button
      type="button"
      className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-4 text-left text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      aria-label={`${t('home.dateLabel')}: ${label}`}
    >
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );

  function calendar(months: 1 | 2, close: () => void): ReactNode {
    const picker = singleMode ? (
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={(next) => selectSingleDate(next, close)}
        disabled={calendarToday ? { before: calendarToday } : undefined}
        numberOfMonths={months}
        formatters={formatters}
        className="sf-calendar w-full [--cell-size:2.25rem]"
      />
    ) : (
      <Calendar
        mode="range"
        selected={range}
        onSelect={(next) => selectDateRange(next, close)}
        disabled={calendarToday ? { before: calendarToday } : undefined}
        numberOfMonths={months}
        resetOnSelect
        formatters={formatters}
        className="sf-calendar w-full [--cell-size:2.25rem]"
      />
    );

    return (
      <div className="flex flex-col">
        {showModeTabs && availableModes.length > 1 ? (
          <ModeToggle
            mode={mode}
            modes={availableModes}
            onModeChange={onModeChange}
            appearance="tabs"
          />
        ) : null}
        <div className="overflow-x-auto p-3">{picker}</div>
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-6 py-4 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          {description}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-153 p-0 before:absolute before:-top-2 before:left-1/5 before:size-4 before:-translate-x-1/2 before:rotate-45 before:border-t before:border-l before:border-border before:bg-popover"
          >
            {calendar(2, () => setPopoverOpen(false))}
          </PopoverContent>
        </Popover>
      </div>
      <div className="md:hidden">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>{t('home.pickDate')}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto">{calendar(1, () => setDrawerOpen(false))}</div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
