import type { PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@booking/ui/components/ui/command';
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
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  Info,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Form } from 'react-router';
import { NsI18n, useTranslation, type Locale } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { dateLabelInTz, dateOnlyToLocal, DEFAULT_TZ, localToDateOnly } from '../../lib/time';
import { typeIcon } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import {
  canSubmitSearch,
  dateSelectionForMode,
  parseSearchState,
  selectedDates,
  validDailyRange,
  type SearchDateSelection,
  type SearchMode,
  type StorefrontSearchState,
} from './search-state';

type DateRange = { from: Date | undefined; to?: Date | undefined };
export type LocationOption = string | { value: string; label: string };
type SearchFormVariant = 'hero' | 'bar';
type ModeAppearance = 'pills' | 'tabs';

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20] as const;

function searchableModes(type: PublicListingTypeResponse | undefined): SearchMode[] {
  if (!type || type.searchConfig.schedule === 'none') return [];
  return (['hourly', 'daily', 'inventory'] as const).filter((mode) =>
    type.allowedModes.includes(mode),
  );
}

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
  onTypeChange,
}: {
  listingTypes: PublicListingTypeResponse[];
  currentType?: string;
  initialState?: StorefrontSearchState;
  locations?: LocationOption[];
  variant: SearchFormVariant;
  onTypeChange?: (typeSlug: string) => void;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locale = useLocale();
  const isHero = variant === 'hero';
  const state = initialState ?? parseSearchState(new URLSearchParams());
  const studioType = listingTypes.find((type) => type.slug.toLowerCase() === 'studio');
  const initialType = currentType ?? studioType?.slug ?? listingTypes[0]?.slug ?? 'studio';
  const [selectedType, setSelectedType] = useState(initialType);
  const initialConfig = listingTypes.find((type) => type.slug === initialType)?.searchConfig;
  const [mode, setMode] = useState<SearchMode>(
    (initialState ? state.mode : (initialConfig?.schedule ?? 'none')) as SearchMode,
  );
  const seed = selectedDates(state);
  const [date, setDate] = useState(seed.date);
  const [range, setRange] = useState<DateRange>(() => toRange(seed));
  const [startTime, setStartTime] = useState(state.startTime);
  const [endTime, setEndTime] = useState(state.endTime);
  const types = [...listingTypes].sort((left, right) => {
    if (left.slug.toLowerCase() === 'studio') return -1;
    if (right.slug.toLowerCase() === 'studio') return 1;
    return 0;
  });
  const selectedListingType = listingTypes.find((type) => type.slug === selectedType);
  const fixedPackages = selectedListingType?.bookingSelection === 'fixed_packages';
  const selectedConfig = selectedListingType?.searchConfig;
  const availableModes = searchableModes(selectedListingType);
  const optionMap = new Map<string, string>();
  for (const option of locations) {
    if (typeof option === 'string') optionMap.set(option, option);
    else optionMap.set(option.value, option.label);
  }
  if (state.location && !optionMap.has(state.location))
    optionMap.set(state.location, state.location);
  const options = [...optionMap].map(([value, label]) => ({ value, label }));
  const action = storefrontPaths.catalog(locale, selectedType);
  const rangeFrom = range.from ? localToDateOnly(range.from) : undefined;
  const rangeTo = range.to ? localToDateOnly(range.to) : undefined;
  const dailyRange = validDailyRange(rangeFrom, rangeTo);
  const canSubmit =
    canSubmitSearch(mode, rangeFrom, rangeTo) &&
    (mode !== 'hourly' || fixedPackages || !date || startTime < endTime);

  function changeType(nextType: string): void {
    const schedule =
      listingTypes.find((type) => type.slug === nextType)?.searchConfig.schedule ?? 'none';
    const selection = dateSelectionForMode(schedule as SearchMode);
    setDate(selection.date);
    setRange(toRange(selection));
    setMode(selection.mode);
    setSelectedType(nextType);
    onTypeChange?.(nextType);
  }

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
          onSelectType={changeType}
          variant={variant}
        />
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-4',
          isHero ? 'px-5 pt-5 pb-12 md:px-6' : 'mx-auto max-w-292.5 px-4 pb-6 lg:px-0',
        )}
      >
        {isHero && availableModes.length ? (
          <div className="flex flex-col items-start gap-2">
            <ModeToggle
              mode={mode}
              modes={availableModes}
              onModeChange={changeMode}
              appearance="pills"
            />
            <span className="text-xs font-medium text-primary">{modeHint(mode, t)}</span>
          </div>
        ) : null}

        {mode !== 'none' ? <input type="hidden" name="mode" value={mode} /> : null}
        {(mode === 'hourly' || (fixedPackages && mode === 'daily')) && date ? (
          <input type="hidden" name="date" value={date} />
        ) : (mode === 'daily' || mode === 'inventory') && dailyRange ? (
          <>
            <input type="hidden" name="from" value={dailyRange.from} />
            <input type="hidden" name="to" value={dailyRange.to} />
          </>
        ) : null}

        <div
          className={cn(
            'grid gap-3',
            isHero ? 'sm:grid-cols-2 lg:grid-cols-5' : 'lg:grid-cols-4 xl:grid-cols-6',
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

          <LocationCombobox key={state.location} initialValue={state.location} options={options} />

          {mode !== 'none' ? (
            <SearchDatePicker
              mode={mode}
              onModeChange={changeMode}
              date={date}
              setDate={setDate}
              range={range}
              setRange={setRange}
              showModeTabs={!isHero}
              availableModes={availableModes}
              singleDate={fixedPackages}
            />
          ) : null}

          {mode === 'hourly' && !fixedPackages ? (
            <TimeRangeField
              startTime={startTime}
              endTime={endTime}
              onStartTimeChange={setStartTime}
              onEndTimeChange={setEndTime}
              disabled={!date}
            />
          ) : null}

          {selectedConfig?.showGuests ? (
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
          ) : null}

          {mode === 'inventory' ? (
            <SearchField icon={Info} label={t('home.quantity')}>
              <Input
                name="quantity"
                type="number"
                min={1}
                max={100}
                defaultValue={state.quantity}
                className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              />
            </SearchField>
          ) : null}

          {/* `has-[>svg]:px-7` is load-bearing: `size="control"` sets
              `has-[>svg]:px-4`, and a :has() selector outranks a bare `px-7`,
              so without it the icon in here would silently narrow the button. */}
          {!isHero ? (
            <Button
              type="submit"
              size="control"
              className="px-7 has-[>svg]:px-7"
              disabled={!canSubmit}
            >
              <Search data-icon="inline-start" /> {t('home.search')}
            </Button>
          ) : null}
        </div>

        {isHero ? (
          <div className="absolute inset-x-0 -bottom-6 flex justify-center">
            <Button
              type="submit"
              size="control"
              className="min-w-60 shadow-md"
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

function TimeRangeField({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  disabled,
}: {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  return (
    <div className="flex h-11 min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
      <Clock3 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          name="startTime"
          type="time"
          step={300}
          value={startTime}
          onChange={(event) => onStartTimeChange(event.target.value)}
          disabled={disabled}
          aria-label={t('home.startTime')}
          className="w-[5ch] min-w-[5ch] appearance-none bg-transparent text-sm tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="text-muted-foreground" aria-hidden="true">
          –
        </span>
        <input
          name="endTime"
          type="time"
          step={300}
          value={endTime}
          onChange={(event) => onEndTimeChange(event.target.value)}
          disabled={disabled}
          aria-label={t('home.endTime')}
          className="w-[5ch] min-w-[5ch] appearance-none bg-transparent text-sm tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function LocationCombobox({
  initialValue,
  options,
}: {
  initialValue: string;
  options: { value: string; label: string }[];
}) {
  const { t } = useTranslation(NsI18n.Common);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const placeholder = t('home.locationPlaceholder');

  function select(nextValue: string): void {
    setValue(nextValue);
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name="location" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={placeholder}
            className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-4 text-left text-foreground shadow-xs hover:bg-accent focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                !selected && 'text-muted-foreground',
              )}
            >
              {selected?.label ?? placeholder}
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-muted-foreground opacity-70"
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-content-available-width)] p-0"
        >
          <Command>
            <CommandInput placeholder={t('home.searchLocation')} />
            <CommandList id={listId}>
              <CommandEmpty>{t('home.noLocationResults')}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={placeholder}
                  onSelect={() => select('')}
                  className="data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                >
                  <Check
                    className={cn('mr-2 size-4 text-primary', value ? 'opacity-0' : 'opacity-100')}
                  />
                  {placeholder}
                </CommandItem>
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => select(option.value)}
                      className={cn(
                        'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary',
                        isSelected &&
                          'bg-primary text-primary-foreground data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                      )}
                    >
                      <Check
                        className={cn(
                          'mr-2 size-4',
                          isSelected
                            ? 'text-primary-foreground opacity-100'
                            : 'text-primary opacity-0',
                        )}
                      />
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

type Translate = ReturnType<typeof useTranslation<typeof NsI18n.Common>>['t'];

function modeHint(mode: SearchMode, t: Translate): string {
  if (mode === 'hourly') return t('home.bookHourlyHint');
  if (mode === 'inventory') return t('home.inventoryHint');
  return t('home.bookDailyHint');
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
  modes,
  onModeChange,
  appearance,
}: {
  mode: SearchMode;
  modes: SearchMode[];
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
      {modes.map((item) => (
        <ToggleGroupItem key={item} value={item} className={MODE_ITEM_CLASS[appearance]}>
          {item === 'hourly' ? t('home.bookHourly') : t('home.bookDaily')}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** One bordered box holding an icon + a control: the box IS the form control, so it
 *  owns the 44px geometry and the control inside is stripped of its own
 *  border/height/padding (`h-auto border-0 p-0` — merged last, so it beats the
 *  primitive's own `h-11 px-4`). */
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
    <label className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-border bg-background px-4 text-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
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
  const formatters = useCalendarFormatters(locale);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calendarToday, setCalendarToday] = useState<Date>();
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setCalendarToday(today);
  }, []);
  const day = (value: Date): string => dateLabelInTz(localToDateOnly(value), DEFAULT_TZ, locale);
  const isSingleDayRange =
    Boolean(range.from && range.to) && localToDateOnly(range.from!) === localToDateOnly(range.to!);
  const label =
    mode === 'hourly' || singleDate
      ? date
        ? dateLabelInTz(date, DEFAULT_TZ, locale)
        : t('home.pickDate')
      : range.from
        ? isSingleDayRange
          ? day(range.from)
          : `${day(range.from)} - ${range.to ? day(range.to) : t('home.endDate')}`
        : t('home.pickDate');
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

  function calendar(months: 1 | 2, close: () => void): React.ReactNode {
    const picker =
      mode === 'hourly' || singleDate ? (
        <Calendar
          mode="single"
          selected={date ? dateOnlyToLocal(date) : undefined}
          onSelect={(next) => {
            if (!next) return;
            setDate(localToDateOnly(next));
            close();
          }}
          disabled={calendarToday ? { before: calendarToday } : undefined}
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
