import type { PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import { cn } from '@booking/ui/lib/utils';
import { Info, Search, Users } from 'lucide-react';
import { Form } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { SearchDatePicker } from './search-date-picker';
import {
  CategoryPicker,
  LocationCombobox,
  ModeToggle,
  SearchField,
  modeHint,
} from './search-form-controls';
import type { LocationOption, SearchFormVariant } from './search-form-types';
import type { StorefrontSearchState } from './search-state';
import { useSearchFormController } from './use-search-form-controller';

export type { LocationOption } from './search-form-types';

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20] as const;

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
  const isHero = variant === 'hero';
  const {
    action,
    availableModes,
    canSubmit,
    changeMode,
    changeType,
    dailyRange,
    date,
    fixedPackages,
    mode,
    options,
    range,
    selectedConfig,
    selectedType,
    setDate,
    setRange,
    state,
    types,
  } = useSearchFormController({
    listingTypes,
    currentType,
    initialState,
    locations,
    onTypeChange,
  });

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
