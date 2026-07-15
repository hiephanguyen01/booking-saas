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
import { useState } from 'react';
import { Form } from 'react-router';
import { storefrontPaths } from '../../lib/locale-paths';
import { dateOnlyToLocal, localToDateOnly } from '../../lib/time';
import { typeIcon } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import {
  dateSelectionForMode,
  locationSelectOptions,
  parseSearchState,
  type SearchMode,
  type StorefrontSearchState,
  validDailyRange,
} from './search-state';

type DateRange = { from: Date | undefined; to?: Date | undefined };
type SearchFormVariant = 'hero' | 'bar';
const CALENDAR_FORMATTERS = {
  formatCaption: (month: Date) =>
    `Tháng ${String(month.getMonth() + 1).padStart(2, '0')} ${month.getFullYear()}`,
  formatWeekdayName: (day: Date) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][day.getDay()],
};

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
  const locale = useLocale();
  const state = initialState ?? parseSearchState(new URLSearchParams());
  const studioType = listingTypes.find((type) => type.slug.toLowerCase() === 'studio');
  const [selectedType, setSelectedType] = useState(
    currentType ?? studioType?.slug ?? listingTypes[0]?.slug ?? 'studio',
  );
  const [mode, setMode] = useState<SearchMode>(state.mode);
  const [date, setDate] = useState(state.hasDateSelection ? state.date : '');
  const [range, setRange] = useState<DateRange>({
    from: state.hasDailyRange ? dateOnlyToLocal(state.from) : undefined,
    to: state.hasDailyRange ? dateOnlyToLocal(state.to) : undefined,
  });
  const types = [...listingTypes]
    .sort((left, right) => {
      if (left.slug.toLowerCase() === 'studio') return -1;
      if (right.slug.toLowerCase() === 'studio') return 1;
      return 0;
    })
    .slice(0, 6);
  const options = locationSelectOptions(locations, state.location);
  const action = storefrontPaths.catalog(locale, selectedType);
  const isHero = variant === 'hero';
  const dailyRange = validDailyRange(
    range.from ? localToDateOnly(range.from) : undefined,
    range.to ? localToDateOnly(range.to) : undefined,
  );
  const canSubmit = mode === 'hourly' ? Boolean(date) : dailyRange !== null;

  function changeMode(nextMode: SearchMode): void {
    if (nextMode === mode) return;
    const selection = dateSelectionForMode(nextMode);
    setDate(selection.date);
    setRange({
      from: selection.from ? dateOnlyToLocal(selection.from) : undefined,
      to: selection.to ? dateOnlyToLocal(selection.to) : undefined,
    });
    setMode(selection.mode);
  }

  return (
    <Form
      method="get"
      action={action}
      aria-label={isHero ? 'Tìm kiếm studio tại trang chủ' : 'Tìm kiếm studio'}
      className={cn(
        'font-studio',
        isHero
          ? 'rounded-2xl bg-card text-card-foreground shadow-xl'
          : 'bg-foreground text-background',
      )}
    >
      {types.length ? (
        <CategoryPicker
          types={types}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          variant={variant}
          locale={locale}
        />
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-4',
          isHero ? 'px-5 pt-4 pb-5 md:px-6' : 'mx-auto max-w-292.5 px-4 pb-6 lg:px-0',
        )}
      >
        {isHero ? (
          <div className="flex flex-wrap items-center gap-3">
            <ModePills mode={mode} onModeChange={changeMode} />
            <span className="text-xs font-medium text-foreground/70">
              {mode === 'hourly'
                ? 'Dịch vụ được sử dụng trong ngày, tính theo giờ'
                : 'Dịch vụ được sử dụng trong một hoặc nhiều ngày'}
            </span>
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
            isHero ? 'md:grid-cols-4' : 'lg:grid-cols-[1fr_1fr_1fr_1fr_auto]',
          )}
        >
          <SearchField icon={Search} label="Bạn tìm gì?">
            <Input
              name="q"
              defaultValue={state.q}
              placeholder="Bạn tìm gì?"
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </SearchField>

          <SearchField icon={MapPin} label="Khu vực">
            <NativeSelect
              name="location"
              defaultValue={state.location}
              aria-label="Khu vực"
              className="h-auto border-0 bg-transparent p-0 pr-7 shadow-none focus-visible:ring-0"
            >
              <NativeSelectOption value="">Địa điểm</NativeSelectOption>
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

          <SearchField icon={Users} label="Số khách">
            <NativeSelect
              name="guests"
              defaultValue={String(state.guests)}
              aria-label="Số khách"
              className="h-auto border-0 bg-transparent p-0 pr-7 shadow-none focus-visible:ring-0"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((count) => (
                <NativeSelectOption key={count} value={count}>
                  {count === 1 ? '1 - 5 khách' : `${count} khách`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SearchField>

          {!isHero ? (
            <Button type="submit" className="h-11 px-7" disabled={!canSubmit}>
              <Search data-icon="inline-start" /> Tìm kiếm
            </Button>
          ) : null}
        </div>

        {isHero ? (
          <div className="flex justify-center">
            <Button type="submit" size="lg" className="min-w-60 rounded-sm" disabled={!canSubmit}>
              Tìm kiếm
            </Button>
          </div>
        ) : null}
      </div>
    </Form>
  );
}

function CategoryPicker({
  types,
  selectedType,
  setSelectedType,
  variant,
  locale,
}: {
  types: PublicListingTypeResponse[];
  selectedType: string;
  setSelectedType: (value: string) => void;
  variant: SearchFormVariant;
  locale: string;
}) {
  const isHero = variant === 'hero';
  return (
    <div
      className={cn(
        'flex overflow-x-auto overscroll-x-contain',
        isHero
          ? 'rounded-t-2xl border-b border-border/70'
          : 'mx-auto max-w-292.5 px-4 pt-5 pb-4 lg:px-0',
      )}
      aria-label="Loại dịch vụ"
    >
      {types.map((type) => {
        const Icon = typeIcon(type.slug);
        const active = type.slug === selectedType;
        return (
          <button
            key={type.id}
            type="button"
            onClick={() => setSelectedType(type.slug)}
            className={cn(
              'flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset cursor-pointer',
              isHero
                ? 'h-14 min-w-40 flex-1 gap-3 px-6 text-base leading-6 md:min-w-48 md:px-10'
                : 'min-h-11 gap-2 rounded-full border border-transparent px-4 py-2 text-sm text-background/75',
              isHero && !active && 'text-foreground hover:bg-foreground/10  bg-foreground/5',
              active && isHero && '',
              active && !isHero && 'border-background text-background',
            )}
            aria-pressed={active}
          >
            <Icon
              className={cn(isHero ? 'text-foreground size-7 md:size-8' : 'size-5')}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            {listingTypeLabel(type, locale)}
          </button>
        );
      })}
    </div>
  );
}

function listingTypeLabel(type: PublicListingTypeResponse, locale: string): string {
  if (!locale.toLowerCase().startsWith('vi')) return type.name;

  const slug = type.slug.toLowerCase();
  if (slug.includes('studio')) return 'Studio';
  if (slug.includes('photo')) return 'Nhiếp ảnh';
  if (slug.includes('makeup')) return 'Trang điểm';
  if (slug.includes('model')) return 'Người mẫu';
  if (slug.includes('equipment')) return 'Thiết bị';
  if (slug.includes('clothes') || slug.includes('costume') || slug.includes('fashion')) {
    return 'Trang phục';
  }
  return type.name;
}

function ModePills({
  mode,
  onModeChange,
}: {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && onModeChange(value as SearchMode)}
      variant="outline"
      spacing={2}
      aria-label="Hình thức đặt"
    >
      <ToggleGroupItem
        value="hourly"
        className="rounded-full border-border data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
      >
        Đặt theo giờ
      </ToggleGroupItem>
      <ToggleGroupItem
        value="daily"
        className="rounded-full border-border data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
      >
        Đặt theo ngày
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const label =
    mode === 'hourly'
      ? date
        ? dateOnlyToLocal(date).toLocaleDateString('vi-VN')
        : 'Chọn ngày'
      : range.from
        ? range.to
          ? `${range.from.toLocaleDateString('vi-VN')} - ${range.to.toLocaleDateString('vi-VN')}`
          : `${range.from.toLocaleDateString('vi-VN')} - Ngày kết thúc`
        : 'Chọn ngày';
  const description =
    mode === 'hourly'
      ? 'Dịch vụ được sử dụng trong ngày, tính theo giờ'
      : 'Dịch vụ được sử dụng trong một hoặc nhiều ngày';
  const trigger = (
    <button
      type="button"
      className="flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border border-border bg-background px-3 text-left text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      aria-label={`Ngày sử dụng: ${label}`}
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
          formatters={CALENDAR_FORMATTERS}
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
          formatters={CALENDAR_FORMATTERS}
          className="sf-calendar w-full [--cell-size:2.25rem]"
        />
      );

    return (
      <div className="flex flex-col">
        {showModeTabs ? <CalendarModeTabs mode={mode} onModeChange={onModeChange} /> : null}
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
              <DrawerTitle>Chọn ngày sử dụng</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto">{calendar(1, () => setDrawerOpen(false))}</div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function CalendarModeTabs({
  mode,
  onModeChange,
}: {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && onModeChange(value as SearchMode)}
      spacing={0}
      className="grid grid-cols-2 px-6 mx-auto"
      aria-label="Hình thức đặt trong lịch"
    >
      <ToggleGroupItem
        value="hourly"
        className="h-14 rounded-none! border-0 border-b-2 border-transparent bg-transparent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary "
      >
        Đặt theo giờ
      </ToggleGroupItem>
      <ToggleGroupItem
        value="daily"
        className="h-14 rounded-none! border-0 border-b-2 border-transparent bg-transparent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary"
      >
        Đặt theo ngày
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
