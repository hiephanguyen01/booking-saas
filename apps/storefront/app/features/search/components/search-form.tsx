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
  submitAction,
  fieldScope = 'full',
}: SearchFormProps) {
  const { t } = useTranslation(NsI18n.Common);
  const isHero = variant === 'hero';
  const isMobileSheet = variant === 'mobile-sheet';
  const isScheduleGuests = fieldScope === 'schedule-guests';
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
    <SearchField
      icon={Search}
      label={t('home.searchPlaceholder')}
      appearance={isHero ? 'hero' : 'default'}
    >
      <Input
        name="q"
        defaultValue={state.q}
        placeholder={t('home.searchPlaceholder')}
        className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
    </SearchField>
  );

  const locationField = (
    <LocationCombobox
      key={state.location}
      initialValue={state.location}
      options={options}
      appearance={isHero ? 'hero' : 'default'}
    />
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
              appearance={isHero ? 'hero' : 'default'}
            />
          ),
        }
      : null,
    selectedConfig?.showGuests
      ? {
          key: 'guests',
          node: (
            <SearchField
              icon={Users}
              label={t('home.guests')}
              asLabel={false}
              appearance={isHero ? 'hero' : 'default'}
            >
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
    !isScheduleGuests && mode === 'inventory'
      ? {
          key: 'quantity',
          node: (
            <SearchField
              icon={Info}
              label={t('home.quantity')}
              appearance={isHero ? 'hero' : 'default'}
            >
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

  const formAction = submitAction ?? action;

  if (isHero) {
    return (
      <Form
        ref={formRef}
        method="get"
        action={formAction}
        onSubmit={onSubmit}
        aria-label={t('home.search')}
        className={cn(
          PANEL_SURFACE,
          'relative overflow-visible bg-card font-studio text-card-foreground lg:mb-6',
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

        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:gap-0 lg:px-6 lg:pt-5 lg:pb-12">
          {availableModes.length ? (
            <div className="flex flex-col items-start gap-2 lg:gap-4">
              {/* Only offer the day/hour toggle when the type actually supports both.
                  A type with a single booking mode needs no toggle — its lone mode is
                  applied silently (the hidden `mode` input below still carries it). */}
              {availableModes.length > 1 ? (
                <ModeToggle
                  mode={mode}
                  modes={availableModes}
                  onModeChange={changeMode}
                  appearance="hero-pills"
                />
              ) : null}
              <span className="text-xs leading-4 font-medium text-success">
                {modeHint(mode, t)}
              </span>
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
              'lg:grid lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))] lg:gap-4',
              availableModes.length && 'lg:mt-4.5',
            )}
          >
            <div className="min-w-0">{queryField}</div>
            <div className="min-w-0">{locationField}</div>
            {compactFields.length ? (
              <div
                className={cn(
                  'grid gap-2.5',
                  'lg:contents',
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

          <Button
            type="submit"
            size="control"
            className="mt-0.5 w-full font-semibold lg:absolute lg:bottom-0 lg:left-1/2 lg:mt-0 lg:h-12 lg:w-60 lg:-translate-x-1/2 lg:translate-y-1/2 lg:rounded-(--sf-surface-radius) lg:text-base lg:shadow-(--sf-surface-shadow)"
            disabled={!canSubmit}
          >
            {t('home.search')}
          </Button>
        </div>
      </Form>
    );
  }

  if (isMobileSheet) {
    return (
      <Form
        ref={formRef}
        method="get"
        action={formAction}
        onSubmit={onSubmit}
        aria-label={t('home.search')}
        className="rounded-none bg-card font-studio text-card-foreground"
      >
        <div className="flex flex-col gap-3 px-4 pb-8">
          {availableModes.length ? (
            <div className="flex flex-col items-start gap-2">
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

          <div className="flex flex-col gap-2.5">
            {!isScheduleGuests ? (
              <>
                <div className="min-w-0">{queryField}</div>
                <div className="min-w-0">{locationField}</div>
              </>
            ) : null}
            {compactFields.length ? (
              <div
                className={cn(
                  'grid gap-2.5',
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

          <Button
            type="submit"
            size="control"
            className="mt-0.5 w-full font-bold"
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
      action={formAction}
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
          <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
            {queryField}
            {locationField}
            {compactFields.map((field, index) => (
              <div
                key={field.key}
                className={cn(
                  'min-w-0',
                  compactFields.length % 2 === 1 &&
                    index === compactFields.length - 1 &&
                    'md:col-span-2 lg:col-span-1',
                )}
              >
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
