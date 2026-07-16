import type { TranslationShape } from '../translation-shape';
import type { viErrors } from '../vi/errors';

export const enErrors = {
  localeNotFound: 'Locale not found.',
  listingNotFound: 'Listing not found.',
  catalogNotFound: 'Listing type not found.',
  generic: 'Something went wrong.',
  home: 'Back to home',
  tenantSuspendedTitle: '{tenant} is temporarily unavailable',
  tenantSuspendedDescription:
    'This booking site is currently unavailable. Please contact the store owner for details.',
} satisfies TranslationShape<typeof viErrors>;
