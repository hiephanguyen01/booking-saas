import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';
import { publicListingResponseSchema } from './listing-type';

/** What a heart can point at — an individual listing or a whole listing group (studio). */
export const favoriteTargetKindSchema = z.enum(['listing', 'group']);
export type FavoriteTargetKind = z.infer<typeof favoriteTargetKindSchema>;

export const favoriteTargetSchema = z.object({
  target: favoriteTargetKindSchema,
  targetId: uuidSchema,
});
export type FavoriteTarget = z.infer<typeof favoriteTargetSchema>;

/**
 * Body of the storefront toggle action. `intent` says whether the click means
 * add or remove; the backend is idempotent either way (adding an existing
 * favorite / removing a missing one both succeed).
 */
export const toggleFavoriteInputSchema = favoriteTargetSchema.extend({
  intent: z.enum(['add', 'remove']),
});
export type ToggleFavoriteInput = z.infer<typeof toggleFavoriteInputSchema>;

/** Result of a toggle — the resolved state so the client can reconcile optimism. */
export const favoriteToggleResponseSchema = favoriteTargetSchema.extend({
  favorited: z.boolean(),
});
export type FavoriteToggleResponse = z.infer<typeof favoriteToggleResponseSchema>;

/**
 * The current user's favorited target ids — used to light up hearts on any page
 * (home / filter / detail) without a per-card round-trip. Bounded by how many
 * things one customer has favorited, so returning the full set is cheap.
 */
export const favoriteRefsResponseSchema = z.object({
  listingIds: z.array(uuidSchema),
  groupIds: z.array(uuidSchema),
});
export type FavoriteRefsResponse = z.infer<typeof favoriteRefsResponseSchema>;

/** `GET /customer/favorites` — the account "my favorites" grid, paginated. */
export const customerFavoritesQuerySchema = paginationQuerySchema;
export type CustomerFavoritesQuery = z.infer<typeof customerFavoritesQuerySchema>;

/** Each favorited item is shaped exactly like a storefront listing card. */
export const customerFavoriteListResponseSchema = z.object({
  items: z.array(publicListingResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type CustomerFavoriteListResponse = z.infer<typeof customerFavoriteListResponseSchema>;

// ── Dashboard (partner + tenant) "who favorited" ─────────────────────────────

/** One row of the dashboard "who favorited" list. */
export const favoriteEntryResponseSchema = z.object({
  id: uuidSchema,
  customerName: z.string(),
  /** Null — users have no avatar column yet; the UI renders initials. */
  customerAvatarUrl: z.string().nullable(),
  target: favoriteTargetKindSchema,
  targetId: uuidSchema,
  targetTitle: z.string(),
  targetSlug: z.string(),
  createdAt: z.string(),
});
export type FavoriteEntryResponse = z.infer<typeof favoriteEntryResponseSchema>;

const dashboardFavoriteFiltersSchema = paginationQuerySchema.extend({
  /** Filter-tab: everything, only listing hearts, or only group hearts. */
  target: z.enum(['all', 'listing', 'group']).default('all'),
  listingId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Case-insensitive search over customer name / target title. */
  q: z.string().trim().max(200).optional(),
});

export const partnerFavoritesQuerySchema = dashboardFavoriteFiltersSchema;
export type PartnerFavoritesQuery = z.infer<typeof partnerFavoritesQuerySchema>;

export const tenantFavoritesQuerySchema = dashboardFavoriteFiltersSchema.extend({
  partnerId: uuidSchema.optional(),
});
export type TenantFavoritesQuery = z.infer<typeof tenantFavoritesQuerySchema>;

export const favoriteListResponseSchema = z.object({
  items: z.array(favoriteEntryResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  /** Row counts per `target` value (`all`/`listing`/`group`) for the filter tabs. */
  counts: z.record(z.number().int().nonnegative()),
});
export type FavoriteListResponse = z.infer<typeof favoriteListResponseSchema>;

/** `GET …/favorites/summary` — KPI header: total hearts + top favorited targets. */
export const favoriteSummaryTargetSchema = z.object({
  target: favoriteTargetKindSchema,
  targetId: uuidSchema,
  title: z.string(),
  slug: z.string(),
  count: z.number().int().nonnegative(),
});
export type FavoriteSummaryTarget = z.infer<typeof favoriteSummaryTargetSchema>;

export const favoriteSummaryResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  /** Number of distinct customers who favorited any of the caller's targets. */
  uniqueCustomers: z.number().int().nonnegative(),
  /** Highest-favorited targets, most first (capped server-side). */
  topTargets: z.array(favoriteSummaryTargetSchema),
});
export type FavoriteSummaryResponse = z.infer<typeof favoriteSummaryResponseSchema>;
