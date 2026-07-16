import { z } from 'zod';
import { administrativeAddressSnapshotSchema } from './administrative-division';
import { slugSchema } from './tenancy';

/** How a listing may be booked (mirrors the Prisma BookingMode enum, §7.3). */
export const bookingModeSchema = z.enum(['hourly', 'daily', 'appointment', 'class', 'inventory']);
export type BookingMode = z.infer<typeof bookingModeSchema>;

/**
 * A listing type's `icon` is an **icon NAME**, not an uploaded image: it is a key
 * into `lucide-react`, which both frontends already depend on. Storing a name
 * (rather than a URL) keeps the glyph theme-aware, weightless, and re-tintable
 * with the tenant's `theme_config` — an uploaded PNG would be none of those.
 *
 * The set is curated on purpose: `icon` is written by a tenant admin and rendered
 * verbatim, so an open string would be both a rendering hazard (a name lucide
 * doesn't export renders nothing) and unbounded. Every name below is verified to
 * exist in the pinned lucide-react. To add one: confirm the export exists, add it
 * here, and add it to `ICON_LABEL` in the dashboard's listing-type form.
 *
 * Bounded by design — see `listingTypeIconSchema` (the 60-char cap the column was
 * always specced with is implied by the enum; no member is close to it).
 */
export const LISTING_TYPE_ICONS = [
  // Studio / media
  'Camera',
  'Aperture',
  'Video',
  'Clapperboard',
  'Projector',
  'Mic',
  'Music',
  'Speaker',
  'Lightbulb',
  // Space / stay
  'Building2',
  'House',
  'Hotel',
  'BedDouble',
  'DoorOpen',
  'Warehouse',
  'Store',
  'Armchair',
  'Sofa',
  'Bath',
  'Landmark',
  // Transport
  'Car',
  'Bike',
  'Ship',
  'Plane',
  // Sport / wellness
  'Dumbbell',
  'Trophy',
  'Waves',
  'HeartPulse',
  'Stethoscope',
  'Footprints',
  // Beauty / fashion
  'Palette',
  'Scissors',
  'Sparkles',
  'Brush',
  'Shirt',
  'Flower2',
  // Learning / events
  'GraduationCap',
  'BookOpen',
  'Users',
  'Drama',
  'PartyPopper',
  'Cake',
  'Utensils',
  'Coffee',
  // Outdoors
  'Tent',
  'TreePine',
  'MapPin',
  // Equipment / misc
  'Package',
  'Boxes',
  'Wrench',
  'Laptop',
  'Monitor',
  'Gamepad2',
  'Baby',
  'Dog',
  'CalendarDays',
  'Clock',
  'Tag',
] as const;

/**
 * Validates `listing_type.icon` on write. An enum (not a free string) so the
 * allowed set is enforced server-side and the picker on the client cannot drift
 * from it. Responses stay `z.string().nullable()` — rows written before this
 * existed must still be readable.
 */
export const listingTypeIconSchema = z.enum(LISTING_TYPE_ICONS);
export type ListingTypeIcon = z.infer<typeof listingTypeIconSchema>;

export const listingStructureSchema = z.enum(['standalone', 'grouped', 'flexible']);
export type ListingStructure = z.infer<typeof listingStructureSchema>;

/** An attribute key is an identifier (e.g. `area`, `style`, `naturalLight`). */
export const attributeKeySchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Must be an identifier (letters, digits, underscore)');

export const attributeFieldTypeSchema = z.enum([
  'text',
  'number',
  'select',
  'multiselect',
  'boolean',
]);
export type AttributeFieldType = z.infer<typeof attributeFieldTypeSchema>;

/** One typed field in a listing type's attribute schema (§7.3). */
export const attributeFieldSchema = z
  .object({
    key: attributeKeySchema,
    label: z.string().min(1).max(120),
    type: attributeFieldTypeSchema,
    required: z.boolean().default(false),
    filterable: z.boolean().default(false),
    options: z.array(z.string().min(1)).optional(),
  })
  .superRefine((field, ctx) => {
    if ((field.type === 'select' || field.type === 'multiselect') && !field.options?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`options` is required for select/multiselect fields',
        path: ['options'],
      });
    }
  });
export type AttributeField = z.infer<typeof attributeFieldSchema>;

export const listingTypeSearchScheduleSchema = z.enum(['none', 'hourly', 'daily', 'inventory']);
export type ListingTypeSearchSchedule = z.infer<typeof listingTypeSearchScheduleSchema>;

export const listingTypeSearchFacetControlSchema = z.enum([
  'checkbox',
  'radio',
  'range',
  'buckets',
]);
export type ListingTypeSearchFacetControl = z.infer<typeof listingTypeSearchFacetControlSchema>;

export const listingTypeSearchBucketSchema = z
  .object({
    id: slugSchema,
    label: z.string().trim().min(1).max(120),
    min: z.number().finite().nonnegative().optional(),
    max: z.number().finite().nonnegative().optional(),
  })
  .refine((bucket) => bucket.min !== undefined || bucket.max !== undefined, {
    message: 'A search bucket needs min or max',
  })
  .refine(
    (bucket) => bucket.min === undefined || bucket.max === undefined || bucket.min < bucket.max,
    { path: ['max'], message: 'Bucket max must be greater than min' },
  );
export type ListingTypeSearchBucket = z.infer<typeof listingTypeSearchBucketSchema>;

export const listingTypeSearchAttributeFacetSchema = z
  .object({
    key: attributeKeySchema,
    control: listingTypeSearchFacetControlSchema,
    matchAll: z.boolean().default(false),
    buckets: z.array(listingTypeSearchBucketSchema).max(20).optional(),
  })
  .superRefine((facet, ctx) => {
    if (facet.control === 'buckets' && !facet.buckets?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buckets'],
        message: 'Bucket facets need at least one bucket',
      });
    }
  });
export type ListingTypeSearchAttributeFacet = z.infer<typeof listingTypeSearchAttributeFacetSchema>;

export const listingTypeSearchConfigSchema = z
  .object({
    schedule: listingTypeSearchScheduleSchema.default('none'),
    showGuests: z.boolean().default(false),
    systemFacets: z
      .array(z.enum(['price', 'location', 'amenities']))
      .max(3)
      .default(['price', 'location']),
    attributeFacets: z.array(listingTypeSearchAttributeFacetSchema).max(30).default([]),
  })
  .superRefine((config, ctx) => {
    const keys = config.attributeFacets.map((facet) => facet.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attributeFacets'],
        message: 'Search facet keys must be unique',
      });
    }
  });
export type ListingTypeSearchConfig = z.infer<typeof listingTypeSearchConfigSchema>;

export const attributeSchemaSchema = z.array(attributeFieldSchema).superRefine((fields, ctx) => {
  const keys = fields.map((f) => f.key);
  const duplicates = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate attribute keys: ${duplicates.join(', ')}`,
    });
  }
});

// ── Inputs (validated identically on FE + BE) ────────────────────────────────

const listingTypeBaseSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  /** A lucide-react icon NAME from `LISTING_TYPE_ICONS` — never a URL. */
  icon: listingTypeIconSchema.optional(),
  allowedModes: z.array(bookingModeSchema).min(1),
  defaultModes: z.array(bookingModeSchema).default([]),
  attributeSchema: attributeSchemaSchema.default([]),
  searchConfig: listingTypeSearchConfigSchema.default({}),
  unitLabel: z.string().max(40).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  requiresIdentityVerification: z.boolean().default(false),
  structure: listingStructureSchema.default('standalone'),
  itemLabel: z.string().trim().min(1).max(60).optional(),
});

/** `defaultModes` must be a subset of `allowedModes` (only checked when both present). */
const defaultModesSubsetRefine = (
  value: { allowedModes?: BookingMode[]; defaultModes?: BookingMode[] },
  ctx: z.RefinementCtx,
): void => {
  if (!value.allowedModes || !value.defaultModes) return;
  const allowed = new Set(value.allowedModes);
  const invalid = value.defaultModes.filter((m) => !allowed.has(m));
  if (invalid.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `defaultModes must be a subset of allowedModes; invalid: ${invalid.join(', ')}`,
      path: ['defaultModes'],
    });
  }
};

export const createListingTypeInputSchema =
  listingTypeBaseSchema.superRefine(defaultModesSubsetRefine);
export type CreateListingTypeInput = z.infer<typeof createListingTypeInputSchema>;

export const updateListingTypeInputSchema = listingTypeBaseSchema
  .partial()
  .superRefine(defaultModesSubsetRefine);
export type UpdateListingTypeInput = z.infer<typeof updateListingTypeInputSchema>;

/** Storefront listing query — `attr.*` filters are parsed separately (dynamic keys). */
export const listPublicListingsQuerySchema = z.object({
  type: slugSchema.optional(),
  category: slugSchema.optional(),
  q: z.string().max(200).optional(),
});
export type ListPublicListingsQuery = z.infer<typeof listPublicListingsQuerySchema>;

/**
 * Parse the full storefront listing query into the shape the list use-case
 * consumes. Dynamic `attr.<key>=<value>` equality filters (which zod can't type)
 * are captured via passthrough and folded into `attrFilters`; blank values are
 * dropped (a GET filter form submits every field). Malformed known fields
 * degrade to `undefined` rather than failing the whole search.
 */
export const publicListingsFilterSchema = z
  .object({
    type: slugSchema.optional().catch(undefined),
    category: slugSchema.optional().catch(undefined),
    q: z.string().max(200).optional().catch(undefined),
  })
  .passthrough()
  .transform((raw) => {
    const attrFilters: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('attr.') && key.length > 5 && typeof value === 'string' && value !== '') {
        attrFilters[key.slice(5)] = value;
      }
    }
    return { typeSlug: raw.type, category: raw.category, q: raw.q, attrFilters };
  });
export type PublicListingsFilter = z.infer<typeof publicListingsFilterSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const listingTypeResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  /**
   * A `LISTING_TYPE_ICONS` name. Deliberately looser than the input schema: rows
   * written before the enum existed must still deserialize.
   */
  icon: z.string().nullable(),
  allowedModes: z.array(bookingModeSchema),
  defaultModes: z.array(bookingModeSchema),
  attributeSchema: z.array(attributeFieldSchema),
  searchConfig: listingTypeSearchConfigSchema,
  unitLabel: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  requiresIdentityVerification: z.boolean(),
  structure: listingStructureSchema,
  itemLabel: z.string().nullable(),
  /**
   * Listings currently using this type. Drives the "N listings" column and lets
   * the UI explain up-front why a delete will be refused (a type in use cannot be
   * removed) instead of surfacing it as a failed request.
   */
  listingCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ListingTypeResponse = z.infer<typeof listingTypeResponseSchema>;

/** The storefront menu entry — active types only, schema trimmed to filterable fields. */
export const publicListingTypeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().nullable(),
  unitLabel: z.string().nullable(),
  sortOrder: z.number(),
  requiresIdentityVerification: z.boolean(),
  structure: listingStructureSchema,
  itemLabel: z.string().nullable(),
  allowedModes: z.array(bookingModeSchema),
  defaultModes: z.array(bookingModeSchema),
  attributeSchema: z.array(attributeFieldSchema),
  searchConfig: listingTypeSearchConfigSchema,
});
export type PublicListingTypeResponse = z.infer<typeof publicListingTypeResponseSchema>;

export const publicListingResponseSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['listing', 'group']),
    title: z.string(),
    slug: z.string(),
    listingTypeSlug: z.string(),
    attributes: z.record(z.unknown()),
    photos: z.array(z.unknown()),
    /** Lowest configured price in VND đồng as a digit string, or null. */
    priceFrom: z.string().nullable(),
    itemLabel: z.string().nullable(),
  })
  .merge(administrativeAddressSnapshotSchema);
export type PublicListingResponse = z.infer<typeof publicListingResponseSchema>;
