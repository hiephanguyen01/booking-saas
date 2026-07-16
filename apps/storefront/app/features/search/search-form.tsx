import type { PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { cn } from '@booking/ui/lib/utils';
import { CalendarDays, ChevronDown, Info, MapPin, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Form } from 'react-router';
import { NsI18n, useTranslation, type Locale } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { dateLabelInTz, dateOnlyToLocal, DEFAULT_TZ, localToDateOnly } from '../../lib/time';
import { typeIcon } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import {
  dateSelectionForMode,
  locationSelectOptions,
  canSubmitSearch,
  parseSearchState,
  type SearchDateSelection,
  type SearchMode,
  type StorefrontSearchState,
  selectedDates,
  validDailyRange,
} from './search-state';

type DateRange = { from: Date | undefined; to?: Date | undefined };
type SearchFormVariant = 'hero' | 'bar';
type ModeAppearance = 'pills' | 'tabs';

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20] as const;
const MAX_TYPE_TABS = 6;

function toRange(selection: SearchDateSelection): DateRange {
  return {
    from: selection.from ? dateOnlyToLocal(selection.from) : undefined,
    to: selection.to ? dateOnlyToLocal(selection.to) : undefined,
  };
}

export function SearchForm({
  listingTypes,
  currentType,
  initialState,
  locations = [],
  variant,
}: {
  listingTypes: PublicListingTypeResponse[];
  currentType?: string;
  initialState?: StorefrontSearchState;
  locations?: string[];
  variant: SearchFormVariant;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locale = useLocale();
  const isHero = variant === 'hero';
  const state = initialState ?? parseSearchState(new URLSearchParams());
  const initialMode: SearchMode = initialState ? state.mode : isHero ? 'daily' : state.mode;
  const studioType = listingTypes.find((type) => type.slug.toLowerCase() === 'studio');
  const [selectedType, setSelectedType] = useState(
    currentType ?? studioType?.slug ?? listingTypes[0]?.slug ?? 'studio',
  );
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const seed = selectedDates(state);
  const [date, setDate] = useState(seed.date);
  const [range, setRange] = useState<DateRange>(toRange(seed));
  const types = [...listingTypes]
    .sort((left, right) => {
      if (left.slug.toLowerCase() === 'studio') return -1;
      if (right.slug.toLowerCase() === 'studio') return 1;
      return 0;
    })
    .slice(0, MAX_TYPE_TABS);
  const options = locationSelectOptions(locations, state.location);
  const action = storefrontPaths.catalog(locale, selectedType);
  const rangeFrom = range.from ? localToDateOnly(range.from) : undefined;
  const rangeTo = range.to ? localToDateOnly(range.to) : undefined;
  const dailyRange = validDailyRange(rangeFrom, rangeTo);
  const canSubmit = canSubmitSearch(mode, rangeFrom, rangeTo);

  function changeMode(nextMode: SearchMode): void {
    if (nextMode === mode) return;
    const selection = dateSelectionForMode(nextMode);
    setDate(selection.date);
    setRange(toRange(selection));
    setMode(selection.mode);
  }

  return (
    <Form
      method="get"
      action={action}
      aria-label={t('home.search')}
      className={cn(
        'font-studio',
        isHero
          ? 'relative rounded-lg bg-card text-card-foreground shadow-lg'
          : 'bg-foreground text-background',
      )}
    >
      {types.length ? (
        <CategoryPicker
          types={types}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          variant={variant}
        />
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-4',
          isHero ? 'px-5 pt-5 pb-12 md:px-6' : 'mx-auto max-w-292.5 px-4 pb-6 lg:px-0',
        )}
      >
        {isHero ? (
          <div className="flex flex-col items-start gap-2">
            <ModeToggle mode={mode} onModeChange={changeMode} appearance="pills" />
            <span className="text-xs font-medium text-primary">{modeHint(mode, t)}</span>
          </div>
        ) : null}

        <input type="hidden" name="mode" value={mode} />
        {mode === 'hourly' && date ? (
          <input type="hidden" name="date" value={date} />
        ) : dailyRange ? (
          <>
            <input type="hidden" name="from" value={dailyRange.from} />
            <input type="hidden" name="to" value={dailyRange.to} />
          </>
        ) : null}

        <div
          className={cn(
            'grid gap-3',
            isHero ? 'sm:grid-cols-2 lg:grid-cols-4' : 'lg:grid-cols-[1fr_1fr_1fr_1fr_auto]',
          )}
        >
          <SearchField icon={Search} label={t('home.searchPlaceholder')}>
            <Input
              name="q"
              defaultValue={state.q}
              placeholder={t('home.searchPlaceholder')}
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </SearchField>

          <SearchField icon={MapPin} label={t('home.locationPlaceholder')}>
            <NativeSelect
              name="location"
              defaultValue={state.location}
              aria-label={t('home.locationPlaceholder')}
              className="h-auto border-0 bg-transparent p-0 pr-7 shadow-none focus-visible:ring-0"
            >
              <NativeSelectOption value="">{t('home.locationPlaceholder')}</NativeSelectOption>
              {options.map((location) => (
                <NativeSelectOption key={location} value={location}>
                  {location}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SearchField>

          <SearchDatePicker
            mode={mode}
            onModeChange={changeMode}
            date={date}
            setDate={setDate}
            range={range}
            setRange={setRange}
            showModeTabs={!isHero}
          />

          <SearchField icon={Users} label={t('home.guests')}>
            <NativeSelect
              name="guests"
              defaultValue={String(state.guests)}
              aria-label={t('home.guests')}
              className="h-auto border-0 bg-transparent p-0 pr-7 shadow-none focus-visible:ring-0"
            >
              {GUEST_OPTIONS.map((count) => (
                <NativeSelectOption key={count} value={count}>
                  {count === 1 ? t('home.guestsPlaceholder') : t('home.guestsCount', { count })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SearchField>

          {!isHero ? (
            <Button type="submit" className="h-11 px-7" disabled={!canSubmit}>
              <Search data-icon="inline-start" /> {t('home.search')}
            </Button>
          ) : null}
        </div>

        {isHero ? (
          <div className="absolute inset-x-0 -bottom-6 flex justify-center">
            <Button
              type="submit"
              size="lg"
              className="min-w-60 rounded-sm shadow-md"
              disabled={!canSubmit}
            >
              {t('home.search')}
            </Button>
          </div>
        ) : null}
      </div>
    </Form>
  );
}

type Translate = ReturnType<typeof useTranslation<typeof NsI18n.Common>>['t'];

function modeHint(mode: SearchMode, t: Translate): string {
  return mode === 'hourly' ? t('home.bookHourlyHint') : t('home.bookDailyHint');
}

function CategoryPicker({
  types,
  selectedType,
  onSelectType,
  variant,
}: {
  types: PublicListingTypeResponse[];
  selectedType: string;
  onSelectType: (value: string) => void;
  variant: SearchFormVariant;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const isHero = variant === 'hero';
  return (
    <ToggleGroup
      type="single"
      value={selectedType}
      onValueChange={(value) => value && onSelectType(value)}
      aria-label={t('home.listingTypes')}
      className={cn(
        'w-full overflow-x-auto overscroll-x-contain rounded-none',
        isHero ? 'rounded-t-lg bg-muted shadow-sm' : 'mx-auto max-w-292.5 px-4 pt-5 pb-4 lg:px-0',
      )}
    >
      {types.map((type) => {
        const Icon = typeIcon(type.slug);
        return (
          <ToggleGroupItem
            key={type.id}
            value={type.slug}
            className={cn(
              'font-medium whitespace-nowrap',
              isHero
                ? 'h-14 min-w-40 flex-1 gap-3 rounded-none! px-6 text-base leading-6 text-foreground hover:bg-foreground/5 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm! md:min-w-48 md:px-10'
                : 'min-h-11 gap-2 rounded-full! border border-transparent px-4 py-2 text-sm text-background/75 hover:bg-background/10 hover:text-background data-[state=on]:border-background data-[state=on]:bg-transparent data-[state=on]:text-background',
            )}
          >
            <Icon
              className={cn(isHero ? 'size-7 text-foreground md:size-8' : 'size-5')}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            {type.name}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

const MODE_ITEM_CLASS: Record<ModeAppearance, string> = {
  pills:
    'h-10 rounded-full border-border px-4 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary',
  tabs: 'h-14 rounded-none! border-0 border-b-2 border-transparent bg-transparent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary',
};

function ModeToggle({
  mode,
  onModeChange,
  appearance,
}: {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  appearance: ModeAppearance;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const isPills = appearance === 'pills';
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && onModeChange(value as SearchMode)}
      variant={isPills ? 'outline' : 'default'}
      spacing={isPills ? 3 : 0}
      className={cn(!isPills && 'mx-auto grid grid-cols-2 px-6')}
      aria-label={t('home.bookingMode')}
    >
      <ToggleGroupItem value="hourly" className={MODE_ITEM_CLASS[appearance]}>
        {t('home.bookHourly')}
      </ToggleGroupItem>
      <ToggleGroupItem value="daily" className={MODE_ITEM_CLASS[appearance]}>
        {t('home.bookDaily')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function SearchField({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Search;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex h-11 min-w-0 items-center gap-2 rounded-sm border border-border bg-background px-3 text-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
      <span className="sr-only">{label}</span>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 [&_[data-slot=native-select-wrapper]]:w-full">
        {children}
      </span>
    </label>
  );
}

/** Locale-aware month caption + weekday names; `Intl` keeps SSR and client in step. */
function useCalendarFormatters(locale: Locale) {
  return useMemo(() => {
    const tag = locale === 'en' ? 'en-GB' : 'vi-VN';
    const caption = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short' });
    return {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (day: Date) => weekday.format(day),
    };
  }, [locale]);
}

function SearchDatePicker({
  mode,
  onModeChange,
  date,
  setDate,
  range,
  setRange,
  showModeTabs,
}: {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  date: string;
  setDate: (value: string) => void;
  range: DateRange;
  setRange: (value: DateRange) => void;
  showModeTabs: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locale = useLocale();
  const formatters = useCalendarFormatters(locale);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const day = (value: Date): string => dateLabelInTz(localToDateOnly(value), DEFAULT_TZ, locale);
  const label =
    mode === 'hourly'
      ? date
        ? dateLabelInTz(date, DEFAULT_TZ, locale)
        : t('home.pickDate')
      : range.from
        ? `${day(range.from)} - ${range.to ? day(range.to) : t('home.endDate')}`
        : t('home.pickDate');
  const description = modeHint(mode, t);
  const trigger = (
    <button
      type="button"
      className="flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border border-border bg-background px-3 text-left text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      aria-label={`${t('home.dateLabel')}: ${label}`}
    >
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );

  function calendar(months: 1 | 2, close: () => void): React.ReactNode {
    const picker =
      mode === 'hourly' ? (
        <Calendar
          mode="single"
          selected={date ? dateOnlyToLocal(date) : undefined}
          onSelect={(next) => {
            if (!next) return;
            setDate(localToDateOnly(next));
            close();
          }}
          disabled={{ before: new Date() }}
          numberOfMonths={months}
          formatters={formatters}
          className="sf-calendar w-full [--cell-size:2.25rem]"
        />
      ) : (
        <Calendar
          mode="range"
          selected={range}
          onSelect={(next) => {
            const selected = next ?? { from: undefined };
            setRange(selected);
            if (selected.from && selected.to) close();
          }}
          disabled={{ before: new Date() }}
          numberOfMonths={months}
          min={1}
          resetOnSelect
          formatters={formatters}
          className="sf-calendar w-full [--cell-size:2.25rem]"
        />
      );

    return (
      <div className="flex flex-col">
        {showModeTabs ? (
          <ModeToggle mode={mode} onModeChange={onModeChange} appearance="tabs" />
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
