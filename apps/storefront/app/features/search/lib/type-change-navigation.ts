import type { PublicListingTypeResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { parseSearchState } from '~/features/search/lib/search-state';

const COMMON_SEARCH_FIELDS = ['q', 'location', 'guests', 'quantity'] as const;

/**
 * Builds the canonical catalog destination for a listing-type switch.
 *
 * Only search-bar values survive. Schedule selections and catalog-only facets
 * belong to the previous type, so the target type starts from its configured
 * schedule while preserving the visitor's keyword/location and relevant counts.
 */
export function buildTypeChangeCatalogHref(
  locale: Locale,
  formData: FormData | undefined,
  targetType: PublicListingTypeResponse,
): string {
  const current = new URLSearchParams();
  if (formData) {
    for (const field of COMMON_SEARCH_FIELDS) {
      const value = formData.get(field);
      if (typeof value === 'string') current.set(field, value);
    }
  }

  const state = parseSearchState(current);
  const next = new URLSearchParams();
  if (state.q) next.set('q', state.q);
  if (state.location) next.set('location', state.location);

  const mode = targetType.searchConfig.schedule;
  if (mode !== 'none') next.set('mode', mode);
  if (targetType.searchConfig.showGuests) next.set('guests', String(state.guests));
  if (mode === 'inventory') next.set('quantity', String(state.quantity));

  const pathname = storefrontPaths.catalog(locale, targetType.slug);
  return next.size ? `${pathname}?${next.toString()}` : pathname;
}
