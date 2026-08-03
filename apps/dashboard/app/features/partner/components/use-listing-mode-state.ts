import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BookingMode,
  CreateListingInput,
  ListingResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import {
  buildModeConfig,
  initialDynamic,
  int,
  savedModeConfig,
  type DynamicState,
} from '~/features/partner/lib/listing-mode-config';

/** Only these modes are bookable in Phase 1 and have a config panel. */
export const CONFIGURABLE: BookingMode[] = ['hourly', 'daily', 'inventory'];

export interface ListingModeState {
  state: DynamicState;
  set: <K extends keyof DynamicState>(key: K, value: DynamicState[K]) => void;
  toggleMode: (mode: BookingMode, on: boolean) => void;
}

/**
 * The listing form's dynamic block state: booking-mode selection, per-mode
 * config and type attributes. Kept in local string state (for controlled number
 * inputs) and mirrored into react-hook-form via `setValue`, so the shared schema
 * validates `bookingModes`/`modeConfig`/`stockQuantity`/`attributes` client-side.
 *
 * The mode-config round-trip (read → edit → write) lives in `listing-mode-config`
 * — pure, load-bearing (a dropped key is destroyed on save), and specced.
 */
export function useListingModeState(opts: {
  form: UseFormReturn<CreateListingInput>;
  listing?: ListingResponse;
  listingTypeId: string;
  selectedType?: ListingTypeResponse;
  validateOnChange?: boolean;
}): ListingModeState {
  const { form, listing, listingTypeId, selectedType, validateOnChange = false } = opts;
  const { setValue } = form;

  const [state, setState] = useState<DynamicState>(() =>
    initialDynamic(
      listing,
      (selectedType?.defaultModes ?? []).filter((mode) => CONFIGURABLE.includes(mode)),
    ),
  );
  const pendingUserChange = useRef(false);
  const set = <K extends keyof DynamicState>(key: K, value: DynamicState[K]): void => {
    pendingUserChange.current = true;
    setState((s) => ({ ...s, [key]: value }));
  };
  // The listing's stored mode_config — the base every rebuild spreads over, so a
  // key this form doesn't render survives the wholesale PATCH replace.
  const saved = useMemo(() => savedModeConfig(listing), [listing]);

  // Reset modes/attributes only when the selected type ID actually changes.
  // Depending on the ListingType object made edit forms lose their saved
  // attributes whenever loader data was revalidated with a new object identity.
  const previousListingTypeId = useRef(listingTypeId);
  useEffect(() => {
    if (previousListingTypeId.current === listingTypeId) return;
    previousListingTypeId.current = listingTypeId;

    const modes = (selectedType?.defaultModes ?? []).filter((m) => CONFIGURABLE.includes(m));
    setState((s) => ({ ...s, bookingModes: modes, attributes: {} }));
  }, [listingTypeId, selectedType?.defaultModes]);

  // Mirror the dynamic values into RHF so the schema can validate them.
  useEffect(() => {
    const changedByUser = pendingUserChange.current;
    const options = {
      shouldDirty: changedByUser,
      shouldValidate: changedByUser && validateOnChange,
    };
    setValue('bookingModes', state.bookingModes, options);
    setValue(
      'modeConfig',
      buildModeConfig(
        state,
        saved,
        selectedType?.bookingSelection ?? listing?.bookingSelection ?? 'flexible_duration',
      ) as CreateListingInput['modeConfig'],
      options,
    );
    setValue('attributes', state.attributes, options);
    setValue(
      'stockQuantity',
      state.bookingModes.includes('inventory') ? int(state.stockQuantity, 1) : undefined,
      options,
    );
    pendingUserChange.current = false;
  }, [
    state,
    saved,
    selectedType?.bookingSelection,
    listing?.bookingSelection,
    setValue,
    validateOnChange,
  ]);

  const toggleMode = (mode: BookingMode, on: boolean): void =>
    set(
      'bookingModes',
      on ? [...state.bookingModes, mode] : state.bookingModes.filter((m) => m !== mode),
    );

  return { state, set, toggleMode };
}
