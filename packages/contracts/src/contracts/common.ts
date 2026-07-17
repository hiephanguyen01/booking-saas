import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const localeSchema = z.enum(['vi', 'en']);
export type Locale = z.infer<typeof localeSchema>;

/** Default page size for every list endpoint / list screen — one source of truth. */
export const DEFAULT_PAGE_SIZE = 20;
/** Hard upper bound the API accepts for `pageSize` (guards against unbounded scans). */
export const MAX_PAGE_SIZE = 100;
/** The page-size options offered by the shared pagination control. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * One tier of a cancellation policy (§11.3), e.g. `{hoursBefore: 48, refundPercent: 50}` —
 * refund `refundPercent`% when cancelled at least `hoursBefore` hours before start. Kept
 * loose (plain numbers) here because it is shared by both the listing-policy contract and
 * the immutable booking snapshot, whose historical rows must not be rejected by tighter rules.
 */
export const cancellationTierSchema = z.object({
  hoursBefore: z.number(),
  refundPercent: z.number(),
});
export type CancellationTier = z.infer<typeof cancellationTierSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * A paginated list that also carries per-status row counts for a filter-tab row
 * (`counts.all` = total across every status, ignoring the active status filter).
 * Used by list screens that render `<StatusFilterTabs>` with count chips.
 */
export interface PaginatedWithCounts<T> extends Paginated<T> {
  counts: Record<string, number>;
}

/**
 * Zod envelope for a paginated list response — the runtime-validatable mirror of
 * `Paginated<T>`. Use it when a loader/consumer wants to validate a list body:
 * `paginatedSchema(partnerResponseSchema)`.
 */
export const paginatedSchema = <TItem extends z.ZodTypeAny>(item: TItem) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

/** Standard error envelope returned by the API on every non-2xx response. */
export const apiErrorSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
