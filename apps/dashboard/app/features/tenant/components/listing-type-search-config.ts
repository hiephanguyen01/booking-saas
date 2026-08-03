import {
  listingTypeSearchConfigSchema,
  type AttributeField,
  type BookingMode,
  type ListingTypeSearchConfig,
  type ListingTypeSearchFacetControl,
} from '@booking/contracts';

// Pure search-config domain logic for the listing-type form — no React in here,
// so the invariants stay unit-testable and shareable across the editor pieces.

/** A pristine search config — what a brand-new listing type starts from. */
export const EMPTY_CONFIG = listingTypeSearchConfigSchema.parse({});

/** Booking modes that can drive the storefront search calendar. */
export const SEARCHABLE_MODES = new Set<BookingMode>(['hourly', 'daily', 'inventory']);

/** The facet controls a given attribute type may legally use. */
export function controlsFor(type: AttributeField['type']): ListingTypeSearchFacetControl[] {
  if (type === 'number') return ['range', 'buckets'];
  if (type === 'multiselect') return ['checkbox'];
  return ['checkbox', 'radio'];
}

export function defaultControl(type: AttributeField['type']): ListingTypeSearchFacetControl {
  return type === 'number' ? 'range' : 'checkbox';
}

/**
 * Re-establishes the config's invariants after any edit to the attributes,
 * modes or the config itself: the schedule must be an allowed mode, every
 * attribute facet must point at a filterable attribute, and each facet's
 * control/matchAll/buckets must be legal for the attribute's type.
 */
export function normalizeSearchConfig(
  config: ListingTypeSearchConfig,
  attributes: AttributeField[],
  allowedModes: BookingMode[],
): ListingTypeSearchConfig {
  const fields = new Map(
    attributes.filter((field) => field.filterable).map((field) => [field.key, field]),
  );
  return {
    schedule:
      config.schedule === 'none' || allowedModes.includes(config.schedule)
        ? config.schedule
        : 'none',
    showGuests: config.showGuests,
    systemFacets: [...config.systemFacets],
    attributeFacets: config.attributeFacets.flatMap((facet) => {
      const field = fields.get(facet.key);
      if (!field) return [];
      const allowedControls = controlsFor(field.type);
      const control = allowedControls.includes(facet.control)
        ? facet.control
        : defaultControl(field.type);
      return [
        {
          key: facet.key,
          control,
          matchAll: field.type === 'multiselect' && control === 'checkbox' && facet.matchAll,
          ...(control === 'buckets' ? { buckets: facet.buckets } : {}),
        },
      ];
    }),
  };
}
