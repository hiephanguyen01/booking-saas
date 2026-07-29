import type { PublicListingTypeResponse } from '@booking/contracts';
import { useMemo, useState } from 'react';
import { storefrontPaths } from '~/constants/paths';
import { dateOnlyToLocal, localToDateOnly } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';
import type { DateRange, LocationOption } from '~/features/search/lib/search-form-types';
import {
  canSubmitSearch,
  dateSelectionForMode,
  parseSearchState,
  selectedDates,
  validDailyRange,
  type SearchDateSelection,
  type SearchMode,
  type StorefrontSearchState,
} from '~/features/search/lib/search-state';

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

export function useSearchFormController({
  listingTypes,
  currentType,
  initialState,
  locations,
  onTypeChange,
}: {
  listingTypes: PublicListingTypeResponse[];
  currentType?: string;
  initialState?: StorefrontSearchState;
  locations: LocationOption[];
  onTypeChange?: (typeSlug: string) => void;
}) {
  const locale = useLocale();
  const state = initialState ?? parseSearchState(new URLSearchParams());
  // Default to the tenant's first listing type (by sortOrder from the API) — never a
  // hard-coded slug, so the form reflects whatever types the tenant actually created.
  const initialType = currentType ?? listingTypes[0]?.slug ?? '';
  const [selectedType, setSelectedType] = useState(initialType);
  const initialConfig = listingTypes.find((type) => type.slug === initialType)?.searchConfig;
  const [mode, setMode] = useState<SearchMode>(
    (initialState ? state.mode : (initialConfig?.schedule ?? 'none')) as SearchMode,
  );
  const seed = selectedDates(state);
  const [date, setDate] = useState(seed.date);
  const [range, setRange] = useState<DateRange>(() => toRange(seed));
  // The API already returns types in the tenant's configured `sortOrder`.
  const types = listingTypes;
  const selectedListingType = listingTypes.find((type) => type.slug === selectedType);
  const fixedPackages = selectedListingType?.bookingSelection === 'fixed_packages';
  const selectedConfig = selectedListingType?.searchConfig;
  const availableModes = searchableModes(selectedListingType);
  // `locations` is the tenant's full province list (63 entries on the catalog page)
  // and does not change while the visitor types, so it is mapped once.
  const options = useMemo(() => {
    const optionMap = new Map<string, string>();
    for (const option of locations) {
      if (typeof option === 'string') optionMap.set(option, option);
      else optionMap.set(option.value, option.label);
    }
    if (state.location && !optionMap.has(state.location)) {
      optionMap.set(state.location, state.location);
    }
    return [...optionMap].map(([value, label]) => ({ value, label }));
  }, [locations, state.location]);
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

  return {
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
  };
}
