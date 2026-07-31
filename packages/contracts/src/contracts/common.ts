import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const localeSchema = z.enum(['vi', 'en']);
export type Locale = z.infer<typeof localeSchema>;

/** Maximum user-selected booking duration accepted by Storefront and catalog filters. */
export const MAX_BOOKING_RANGE_DAYS = 31;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real Gregorian calendar date encoded as YYYY-MM-DD. */
export const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_RE, 'Must be an ISO date (YYYY-MM-DD)')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Must be a valid calendar date');

/** A 24-hour wall-clock value encoded as HH:MM. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24h)');

/** VND đồng as a canonical non-negative integer string; money never travels as a JS float. */
export const moneyStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Must be an integer VND amount in đồng')
  .max(20, 'VND amount is too large');

/** Whole calendar days from `from` to `to`, or null for invalid date-only values. */
export function dateOnlyDistanceDays(from: string, to: string): number | null {
  if (!dateOnlySchema.safeParse(from).success || !dateOnlySchema.safeParse(to).success) return null;
  const distance =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isInteger(distance) ? distance : null;
}

/** Exclusive-end booking range (`from` → `to`) bounded against untrusted URL input. */
export const bookingDateRangeSchema = z
  .object({ from: dateOnlySchema, to: dateOnlySchema })
  .superRefine((range, ctx) => {
    const days = dateOnlyDistanceDays(range.from, range.to);
    if (days === null || days <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must be after from',
      });
      return;
    }
    if (days > MAX_BOOKING_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Range must be at most ${MAX_BOOKING_RANGE_DAYS} days`,
      });
    }
  });
export type BookingDateRange = z.infer<typeof bookingDateRangeSchema>;

/** How far ahead a management calendar may be queried in one request. */
export const MAX_CALENDAR_RANGE_DAYS = 366;

/**
 * Longest date span one bulk calendar write may cover. Bounded well below
 * {@link MAX_CALENDAR_RANGE_DAYS} because a bulk write runs a row per date
 * inside a single interactive transaction — a read may span a year, a write
 * holding a transaction open must not.
 */
export const MAX_BULK_CALENDAR_DAYS = 92;

/**
 * Inclusive calendar window for the partner/tenant management calendars
 * (availability exceptions, pricing rules). Both bounds are optional so an
 * omitted query keeps each endpoint's own default window; supplying one bound
 * requires the other, because a half-open window silently truncates the result
 * and the calendar would then render stored overrides as "no override".
 */
export const calendarRangeQuerySchema = z
  .object({ from: dateOnlySchema.optional(), to: dateOnlySchema.optional() })
  .superRefine((range, ctx) => {
    if (range.from === undefined && range.to === undefined) return;
    if (range.from === undefined || range.to === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [range.from === undefined ? 'from' : 'to'],
        message: 'from and to must be supplied together',
      });
      return;
    }
    const days = dateOnlyDistanceDays(range.from, range.to);
    if (days === null || days < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must be on/after from',
      });
      return;
    }
    if (days > MAX_CALENDAR_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Range must be at most ${MAX_CALENDAR_RANGE_DAYS} days`,
      });
    }
  });
export type CalendarRangeQuery = z.infer<typeof calendarRangeQuerySchema>;

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
