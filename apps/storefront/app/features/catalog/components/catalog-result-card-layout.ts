import { SURFACE_FRAME } from '~/constants/surfaces';

/**
 * Structural geometry shared by the real catalogue row and its loading state.
 * Keeping these strings feature-local prevents a skeleton-only responsive
 * override from drifting away from `SearchResultCard` again.
 */
export const CATALOG_RESULT_CARD_SHELL_CLASS =
  `${SURFACE_FRAME} relative flex min-h-32 gap-3 overflow-hidden bg-card p-(--sf-surface-pad) md:grid md:h-46 md:min-h-0 md:grid-cols-[248px_120px_minmax(0,1fr)] md:grid-rows-1 md:gap-x-1.5 md:p-0`;

export const CATALOG_RESULT_PRIMARY_MEDIA_CLASS =
  'relative w-28 shrink-0 overflow-hidden rounded-(--sf-image-radius) bg-muted md:h-full md:w-auto md:rounded-none';

export const CATALOG_RESULT_SECONDARY_MEDIA_CLASS =
  'relative hidden grid-rows-2 gap-1.5 bg-muted md:grid';

export const CATALOG_RESULT_CONTENT_CLASS =
  'flex min-w-0 flex-1 flex-col gap-1 py-0.5 pr-0.5 md:justify-center md:gap-3 md:px-5 md:py-4 md:pr-6 md:pl-[18px]';
