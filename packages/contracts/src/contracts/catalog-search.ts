import { z } from 'zod';
import {
  bookingDateRangeSchema,
  dateOnlySchema,
  moneyStringSchema,
  timeOfDaySchema,
} from './common';
import { publicListingTypeResponseSchema } from './listing-type';
import { geographicPointInputSchema } from './administrative-division';

export const publicCatalogSortSchema = z.enum(['relevance', 'bookings-desc', 'price-asc']);
export type PublicCatalogSort = z.infer<typeof publicCatalogSortSchema>;

const toArray = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const toNonEmptyStrings = (value: unknown): string[] =>
  toArray(value)
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((item) => item.trim())
    .filter(Boolean);

export const publicCatalogSearchQuerySchema = z
  .object({
    type: z.string().trim().min(1).max(100),
    partner: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional()),
    mode: z.preprocess(emptyToUndefined, z.enum(['hourly', 'daily', 'inventory']).optional()),
    q: z.string().trim().max(200).default(''),
    location: z.preprocess(toNonEmptyStrings, z.array(z.string().max(200)).max(30)),
    amenities: z.preprocess(toNonEmptyStrings, z.array(z.string().max(120)).max(30)),
    guests: z.coerce.number().int().min(1).max(100).default(1),
    quantity: z.coerce.number().int().min(1).max(100).default(1),
    date: z.preprocess(emptyToUndefined, dateOnlySchema.optional()),
    startTime: z.preprocess(emptyToUndefined, timeOfDaySchema.optional()),
    endTime: z.preprocess(emptyToUndefined, timeOfDaySchema.optional()),
    from: z.preprocess(emptyToUndefined, dateOnlySchema.optional()),
    to: z.preprocess(emptyToUndefined, dateOnlySchema.optional()),
    minPrice: z.preprocess(emptyToUndefined, moneyStringSchema.optional()),
    maxPrice: z.preprocess(emptyToUndefined, moneyStringSchema.optional()),
    minRating: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(1).max(5).multipleOf(0.5).optional(),
    ),
    sort: publicCatalogSortSchema.default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
  })
  .passthrough()
  .superRefine((query, ctx) => {
    const attributeEntries = Object.entries(query).filter(([key]) => key.startsWith('attr.'));
    if (attributeEntries.length > 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attr'],
        message: 'At most 30 attribute filters are allowed',
      });
    }
    for (const [key, raw] of attributeEntries) {
      if (!/^attr\.[A-Za-z][A-Za-z0-9_]{0,49}(\.(min|max))?$/.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Invalid attribute filter key',
        });
      }
      const values = toArray(raw).filter(
        (value) => typeof value !== 'string' || value.trim() !== '',
      );
      if (values.length === 0) continue;
      if (
        values.length > 30 ||
        values.some((value) => typeof value !== 'string' || value.length > 120)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Invalid attribute filter value',
        });
      }
      if ((key.endsWith('.min') || key.endsWith('.max')) && !Number.isFinite(Number(values[0]))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Attribute range must be numeric',
        });
      }
    }
    for (const [key, raw] of attributeEntries.filter(([key]) => key.endsWith('.min'))) {
      const maxKey = `${key.slice(0, -4)}.max`;
      const minValue = toArray(raw)[0];
      const maxRaw = query[maxKey];
      const maxValue = toArray(maxRaw)[0];
      if (
        typeof minValue === 'string' &&
        minValue.trim() !== '' &&
        typeof maxValue === 'string' &&
        maxValue.trim() !== '' &&
        Number(minValue) > Number(maxValue)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [maxKey],
          message: 'Attribute max must be at least min',
        });
      }
    }
    if (Boolean(query.startTime) !== Boolean(query.endTime) || (!query.date && query.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: 'startTime and endTime must be provided together with date',
      });
    }
    if (query.startTime && query.endTime && query.startTime >= query.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be after startTime',
      });
    }
    if (Boolean(query.from) !== Boolean(query.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from and to are required together',
      });
    }
    if (query.from && query.to) {
      const range = bookingDateRangeSchema.safeParse({ from: query.from, to: query.to });
      if (!range.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: range.error.issues[0]?.message ?? 'Invalid booking date range',
        });
      }
    }
    if (query.minPrice && query.maxPrice && BigInt(query.minPrice) > BigInt(query.maxPrice)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxPrice'],
        message: 'maxPrice must be at least minPrice',
      });
    }
  })
  .transform((query) => {
    const attributes: Record<string, string[]> = {};
    const attributeRanges: Record<string, { min?: number; max?: number }> = {};
    for (const [key, raw] of Object.entries(query)) {
      if (!key.startsWith('attr.')) continue;
      const suffix = key.slice(5);
      if (suffix.endsWith('.min') || suffix.endsWith('.max')) {
        const bound = suffix.endsWith('.min') ? 'min' : 'max';
        const attributeKey = suffix.slice(0, -4);
        const rawValue = Array.isArray(raw) ? raw[0] : raw;
        if (typeof rawValue !== 'string' || rawValue.trim() === '') continue;
        const value = Number(rawValue);
        if (attributeKey && Number.isFinite(value)) {
          attributeRanges[attributeKey] = { ...attributeRanges[attributeKey], [bound]: value };
        }
        continue;
      }
      if (!suffix) continue;
      attributes[suffix] = toArray(raw)
        .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
        .map((value) => value.trim())
        .filter(Boolean);
    }
    return {
      type: query.type,
      partner: query.partner,
      mode: query.mode,
      q: query.q,
      location: query.location,
      amenities: query.amenities,
      guests: query.guests,
      quantity: query.quantity,
      date: query.date,
      startTime: query.startTime,
      endTime: query.endTime,
      from: query.from,
      to: query.to,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
      attributes,
      attributeRanges,
    };
  });
export type PublicCatalogSearchQuery = z.infer<typeof publicCatalogSearchQuerySchema>;

export const publicCatalogFacetOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const publicCatalogFacetSchema = z.object({
  key: z.string(),
  label: z.string(),
  control: z.enum(['checkbox', 'radio', 'range', 'buckets']),
  options: z.array(publicCatalogFacetOptionSchema).default([]),
  min: z.number().finite().nonnegative().optional(),
  /** A lucide icon NAME (from the attribute's `icon`) for the filter, or null. */
  icon: z.string().nullable().default(null),
  max: z.number().finite().nonnegative().optional(),
});
export type PublicCatalogFacet = z.infer<typeof publicCatalogFacetSchema>;

export const publicCatalogSearchRoomSchema = z.object({
  slug: z.string(),
  title: z.string(),
  price: moneyStringSchema,
  capacity: z.number().int().nonnegative().nullable(),
});

export const publicCatalogSearchItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['listing', 'group']),
  title: z.string(),
  slug: z.string(),
  listingTypeSlug: z.string(),
  partnerSlug: z.string(),
  photos: z.array(z.string()),
  address: z.string().nullable(),
  provinceCode: z.string().nullable(),
  provinceName: z.string().nullable(),
  wardCode: z.string().nullable(),
  wardName: z.string().nullable(),
  amenities: z.array(z.string()),
  priceFrom: moneyStringSchema,
  /** Price before a calendar sale; equals priceFrom when no sale applies. */
  regularPriceFrom: moneyStringSchema,
  priceUnit: z.enum(['hour', 'day', 'item', 'session', 'package']),
  completedBookings: z.number().int().nonnegative(),
  ratingAvg: z.number().nullable(),
  reviewCount: z.number().int().nonnegative(),
  matchingRoomCount: z.number().int().positive(),
  rooms: z.array(publicCatalogSearchRoomSchema).max(6),
  /** Only emitted by the privacy-preserving nearby endpoint. */
  distanceMeters: z.number().int().nonnegative().optional(),
});
export type PublicCatalogSearchItem = z.infer<typeof publicCatalogSearchItemSchema>;

export const publicCatalogSearchResponseSchema = z.object({
  type: publicListingTypeResponseSchema,
  applied: z.object({
    type: z.string(),
    partner: z.string().optional(),
    mode: z.enum(['hourly', 'daily', 'inventory']).optional(),
    q: z.string(),
    location: z.array(z.string()),
    amenities: z.array(z.string()),
    guests: z.number(),
    quantity: z.number(),
    date: dateOnlySchema.optional(),
    startTime: timeOfDaySchema.optional(),
    endTime: timeOfDaySchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    minPrice: moneyStringSchema.optional(),
    maxPrice: moneyStringSchema.optional(),
    minRating: z.number().min(1).max(5).multipleOf(0.5).optional(),
    sort: publicCatalogSortSchema,
    page: z.number(),
    pageSize: z.number(),
    attributes: z.record(z.array(z.string())),
    attributeRanges: z.record(z.object({ min: z.number().optional(), max: z.number().optional() })),
  }),
  items: z.array(publicCatalogSearchItemSchema),
  facets: z.array(publicCatalogFacetSchema),
  sortOptions: z.array(publicCatalogSortSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
});
export type PublicCatalogSearchResponse = z.infer<typeof publicCatalogSearchResponseSchema>;

/** Privacy-sensitive device coordinates are accepted in a POST body, never a URL query. */
export const nearbyPublicListingsInputSchema = geographicPointInputSchema.extend({
  type: z.string().trim().min(1).max(100),
});
export type NearbyPublicListingsInput = z.infer<typeof nearbyPublicListingsInputSchema>;

export const nearbyPublicListingSchema = z.object({
  id: z.string(),
  kind: z.enum(['listing', 'group']),
  title: z.string(),
  slug: z.string(),
  listingTypeSlug: z.string(),
  photos: z.array(z.unknown()),
  priceFrom: moneyStringSchema.nullable(),
  regularPriceFrom: moneyStringSchema.nullable(),
  priceUnit: z.enum(['hour', 'day', 'item', 'session', 'package']),
  completedBookings: z.number().int().nonnegative(),
  ratingAvg: z.number().min(1).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
  address: z.string().nullable(),
  provinceCode: z.string().nullable(),
  provinceName: z.string().nullable(),
  wardCode: z.string().nullable(),
  wardName: z.string().nullable(),
  distanceMeters: z.number().int().nonnegative(),
});
export type NearbyPublicListing = z.infer<typeof nearbyPublicListingSchema>;

export const nearbyPublicListingsResponseSchema = z.object({
  items: z.array(nearbyPublicListingSchema).max(10),
});
export type NearbyPublicListingsResponse = z.infer<typeof nearbyPublicListingsResponseSchema>;
