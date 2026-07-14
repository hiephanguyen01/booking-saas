import type { TranslationShape } from '../translation-shape';
import type { viErrors } from '../vi/errors';

export const enErrors = {
  localeNotFound: 'Locale not found.',
  listingNotFound: 'Listing not found.',
  catalogNotFound: 'Listing type not found.',
  generic: 'Something went wrong.',
  home: 'Back to home',
} satisfies TranslationShape<typeof viErrors>;
