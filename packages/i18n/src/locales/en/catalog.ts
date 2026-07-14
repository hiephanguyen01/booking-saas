import type { TranslationShape } from '../translation-shape';
import type { viCatalog } from '../vi/catalog';

export const enCatalog = {
  resultsCount: '{count} results',
  typeNotFound: 'No category “{slug}” found.',
  filter: 'Filter',
  clear: 'Clear',
  allOption: 'All',
  yes: 'Yes',
  no: 'No',
  empty: 'No results match your filters.',
} satisfies TranslationShape<typeof viCatalog>;
