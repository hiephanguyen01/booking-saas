import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { cn } from '@booking/ui/lib/utils';
import { Info, Search, Users } from 'lucide-react';
import { useRef } from 'react';
import { Form } from 'react-router';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { useSearchFormController } from '~/features/search/hooks/use-search-form-controller';
import type { SearchFormProps } from '~/features/search/lib/search-form-types';
import { modeHint } from '~/features/search/lib/search-mode-hint';
import { SearchDatePicker } from './search-date-picker';
import { CategoryPicker, LocationCombobox, ModeToggle, SearchField } from './search-form-controls';

export type { LocationOption } from '~/features/search/lib/search-form-types';

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20] as const;

export function SearchForm({
  listingTypes,
  currentType,
  initialState,
  locations = [],
  variant,
  onTypeChange,
  typeChangeBehavior,
}: SearchFormProps) {
  const { t } = useTranslation(NsI18n.Common);
  const isHero = variant === 'hero';
  const formRef = useRef<HTMLFormElement>(null);
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
    typeChangeBehavior,
  });

  function handleTypeChange(nextType: string): void {
    changeType(nextType, formRef.current ? new FormData(formRef.current) : undefined);
  }

  return (
    <Form
      ref={formRef}
      method="get"
      action={action}
      aria-label={t('home.search')}
      className={cn(
        'font-studio',
        isHero
          ? cn(PANEL_SURFACE, 'relative bg-card text-card-foreground')
          : 'bg-foreground text-background',
      )}
    >
      {types.length ? (
        <CategoryPicker
          types={types}
          selectedType={selectedType}
          onSelectType={handleTypeChange}
          variant={variant}
        />
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-4',
          isHero ? 'px-5 pt-5 pb-5 sm:pb-12 md:px-6' : 'mx-auto max-w-292.5 px-4 pb-6 lg:px-0',
        )}
      >
        {isHero && availableModes.length ? (
          <div className="flex flex-col items-start gap-2">
            {/* Only offer the day/hour toggle when the type actually supports both.
                A type with a single booking mode needs no toggle — its lone mode is
                applied silently (the hidden `mode` input below still carries it). */}
            {availableModes.length > 1 ? (
              <ModeToggle
                mode={mode}
                modes={availableModes}
                onModeChange={changeMode}
                appearance="pills"
              />
            ) : null}
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
              <SearchField icon={Users} label={t('home.guests')} asLabel={false}>
                <Select name="guests" defaultValue={String(state.guests)}>
                  <SelectTrigger
                    aria-label={t('home.guests')}
                    className="w-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GUEST_OPTIONS.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count === 1
                          ? t('home.guestsPlaceholder')
                          : t('home.guestsCount', { count })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          // In flow and full-width on a phone; from `sm` up it goes back to
          // straddling the card's bottom edge. One button, positioned two ways —
          // rendering a second one behind `hidden` would put two submit controls
          // in the same form, which is a real difference to a screen reader and to
          // an Enter keypress, not just a visual one.
          <div className="flex justify-center sm:absolute sm:inset-x-0 sm:-bottom-6">
            <Button
              type="submit"
              size="control"
              className="w-full shadow-md sm:w-auto sm:min-w-60"
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
