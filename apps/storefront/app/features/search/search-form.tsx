import type { PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import { cn } from '@booking/ui/lib/utils';
import { Info, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Form } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { dateOnlyToLocal, localToDateOnly } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import { SearchDatePicker } from './search-date-picker';
import {
  CategoryPicker,
  LocationCombobox,
  ModeToggle,
  SearchField,
  modeHint,
} from './search-form-controls';
import type { DateRange, LocationOption, SearchFormVariant } from './search-form-types';
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

export type { LocationOption } from './search-form-types';

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
  const canSubmit = canSubmitSearch(mode, rangeFrom, rangeTo);

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

        <div className={cn('grid gap-3', !isHero && 'lg:grid-cols-[minmax(0,1fr)_auto]')}>
          <div
            className={cn(
              'grid min-w-0 gap-3',
              isHero
                ? 'sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]'
                : 'lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]',
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

            <LocationCombobox
              key={state.location}
              initialValue={state.location}
              options={options}
            />

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
          </div>

          {/* `has-[>svg]:px-7` is load-bearing: `size="control"` sets
              `has-[>svg]:px-4`, and a :has() selector outranks a bare `px-7`,
              so without it the icon in here would silently narrow the button. */}
          {!isHero ? (
            <Button
              type="submit"
              size="control"
              className="w-full px-7 has-[>svg]:px-7 lg:w-auto"
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
