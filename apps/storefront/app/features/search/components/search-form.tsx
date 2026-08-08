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
  onSubmit,
}: SearchFormProps) {
  const { t } = useTranslation(NsI18n.Common);
  const isHero = variant === 'hero';
  const isMobileSheet = variant === 'mobile-sheet';
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

  const queryField = (
    <SearchField icon={Search} label={t('home.searchPlaceholder')}>
      <Input
        name="q"
        defaultValue={state.q}
        placeholder={t('home.searchPlaceholder')}
        className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
    </SearchField>
  );

  const locationField = (
    <LocationCombobox key={state.location} initialValue={state.location} options={options} />
  );

  /**
   * The narrow controls. They pair up two-per-row on a phone, which is the only
   * reason they are collected rather than rendered inline: a lone date picker at
   * half width beside empty space is worse than one at full width, and only a
   * count knows which of those it is.
   */
  const compactFields = [
    mode !== 'none'
      ? {
          key: 'date',
          node: (
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
          ),
        }
      : null,
    selectedConfig?.showGuests
      ? {
          key: 'guests',
          node: (
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
                      {count === 1 ? t('home.guestsPlaceholder') : t('home.guestsCount', { count })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SearchField>
          ),
        }
      : null,
    mode === 'inventory'
      ? {
          key: 'quantity',
          node: (
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
          ),
        }
      : null,
  ].filter((field) => field !== null);

  if (isHero || isMobileSheet) {
    return (
      <Form
        ref={formRef}
        method="get"
        action={action}
        onSubmit={onSubmit}
        aria-label={t('home.search')}
        className={cn(
          'bg-card font-studio text-card-foreground',
          isHero && PANEL_SURFACE,
          isMobileSheet && 'rounded-none',
        )}
      >
        {isHero && types.length ? (
          <CategoryPicker
            types={types}
            selectedType={selectedType}
            onSelectType={handleTypeChange}
            variant={variant}
          />
        ) : null}

        <div className={cn('flex flex-col gap-3', isMobileSheet ? 'px-4 pb-8' : 'p-4 sm:p-5')}>
          {availableModes.length ? (
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
              <span className="text-xs leading-4 text-muted-foreground">{modeHint(mode, t)}</span>
            </div>
          ) : null}

          <SearchStateInputs
            date={date}
            dailyRange={dailyRange}
            fixedPackages={fixedPackages}
            mode={mode}
          />

          <div
            className={cn(
              'flex flex-col gap-2.5',
              !isMobileSheet && 'lg:flex-row lg:items-start lg:gap-3',
            )}
          >
            <div className={cn('min-w-0', !isMobileSheet && 'lg:flex-1')}>{queryField}</div>
            <div className={cn('min-w-0', !isMobileSheet && 'lg:flex-1')}>{locationField}</div>
            {compactFields.length ? (
              <div
                className={cn(
                  'grid gap-2.5',
                  !isMobileSheet && 'lg:flex-1 lg:auto-cols-fr lg:grid-flow-col lg:gap-3',
                  compactFields.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
                )}
              >
                {compactFields.map((field) => (
                  <div key={field.key} className="min-w-0">
                    {field.node}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* In the card, full width. It used to straddle the card's bottom edge,
              which cost the section below it a 24px gutter it could not use for
              anything else and left the button orphaned from the fields it
              submits. */}
          <Button
            type="submit"
            size="control"
            className={cn(
              'mt-0.5 w-full font-bold',
              !isMobileSheet && 'lg:w-auto lg:min-w-44 lg:self-end',
            )}
            disabled={!canSubmit}
          >
            {t('home.search')}
          </Button>
        </div>
      </Form>
    );
  }

  return (
    <Form
      ref={formRef}
      method="get"
      action={action}
      onSubmit={onSubmit}
      aria-label={t('home.search')}
      className="bg-foreground font-studio text-background"
    >
      {types.length ? (
        <CategoryPicker
          types={types}
          selectedType={selectedType}
          onSelectType={handleTypeChange}
          variant={variant}
        />
      ) : null}

      <div className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 pb-6 lg:px-0">
        <SearchStateInputs
          date={date}
          dailyRange={dailyRange}
          fixedPackages={fixedPackages}
          mode={mode}
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
            {queryField}
            {locationField}
            {compactFields.map((field) => (
              <div key={field.key} className="min-w-0">
                {field.node}
              </div>
            ))}
          </div>

          {/* `has-[>svg]:px-7` is load-bearing: `size="control"` sets
              `has-[>svg]:px-4`, and a :has() selector outranks a bare `px-7`,
              so without it the icon in here would silently narrow the button. */}
          <Button
            type="submit"
            size="control"
            className="w-full px-7 has-[>svg]:px-7 lg:w-auto"
            disabled={!canSubmit}
          >
            <Search data-icon="inline-start" /> {t('home.search')}
          </Button>
        </div>
      </div>
    </Form>
  );
}

/**
 * The hidden inputs that carry whatever the pickers resolved to. Which ones ship
 * depends on the booking mode, and both layouts need exactly the same answer —
 * so it lives in one place rather than being restated per layout.
 */
function SearchStateInputs({
  date,
  dailyRange,
  fixedPackages,
  mode,
}: Pick<
  ReturnType<typeof useSearchFormController>,
  'date' | 'dailyRange' | 'fixedPackages' | 'mode'
>) {
  return (
    <>
      {mode !== 'none' ? <input type="hidden" name="mode" value={mode} /> : null}
      {(mode === 'hourly' || (fixedPackages && mode === 'daily')) && date ? (
        <input type="hidden" name="date" value={date} />
      ) : (mode === 'daily' || mode === 'inventory') && dailyRange ? (
        <>
          <input type="hidden" name="from" value={dailyRange.from} />
          <input type="hidden" name="to" value={dailyRange.to} />
        </>
      ) : null}
    </>
  );
}
