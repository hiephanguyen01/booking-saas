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
} from '../lib/listing-mode-config';

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
}): ListingModeState {
  const { form, listing, listingTypeId, selectedType } = opts;

  const [state, setState] = useState<DynamicState>(() => initialDynamic(listing));
  const set = <K extends keyof DynamicState>(key: K, value: DynamicState[K]): void =>
    setState((s) => ({ ...s, [key]: value }));
  // The listing's stored mode_config — the base every rebuild spreads over, so a
  // key this form doesn't render survives the wholesale PATCH replace.
  const saved = useMemo(() => savedModeConfig(listing), [listing]);

  // Reset modes/attributes when the user switches type (skip the initial mount so
  // an edit form keeps the listing's saved values).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const modes = (selectedType?.defaultModes ?? []).filter((m) => CONFIGURABLE.includes(m));
    setState((s) => ({ ...s, bookingModes: modes, attributes: {} }));
  }, [listingTypeId, selectedType]);

  // Mirror the dynamic values into RHF so the schema can validate them.
  useEffect(() => {
    form.setValue('bookingModes', state.bookingModes);
    form.setValue('modeConfig', buildModeConfig(state, saved) as CreateListingInput['modeConfig']);
    form.setValue('attributes', state.attributes);
    form.setValue(
      'stockQuantity',
      state.bookingModes.includes('inventory') ? int(state.stockQuantity, 1) : undefined,
    );
  }, [state, form, saved]);

  const toggleMode = (mode: BookingMode, on: boolean): void =>
    set(
      'bookingModes',
      on ? [...state.bookingModes, mode] : state.bookingModes.filter((m) => m !== mode),
    );

  return { state, set, toggleMode };
}
