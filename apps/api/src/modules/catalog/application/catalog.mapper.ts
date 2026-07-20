import type {
  ListingTypeResponse,
  PublicListingResponse,
  PublicListingTypeResponse,
} from '@booking/contracts';
import type { ListingTypeRecord } from '../domain/ports/listing-type-repository.port';
import type { PublicListingRecord } from '../domain/ports/listing-read-repository.port';

export function toListingTypeResponse(t: ListingTypeRecord): ListingTypeResponse {
  return {
    id: t.id,
    tenantId: t.tenantId,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    allowedModes: t.allowedModes,
    defaultModes: t.defaultModes,
    bookingSelection: t.bookingSelection,
    attributeSchema: t.attributeSchema,
    searchConfig: t.searchConfig,
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    requiresIdentityVerification: t.requiresIdentityVerification,
    structure: t.structure,
    itemLabel: t.itemLabel,
    listingCount: t.listingCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Menu shape — trims the schema to filterable fields (drives storefront filters). */
export function toPublicListingTypeResponse(t: ListingTypeRecord): PublicListingTypeResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    requiresIdentityVerification: t.requiresIdentityVerification,
    structure: t.structure,
    itemLabel: t.itemLabel,
    allowedModes: t.allowedModes,
    defaultModes: t.defaultModes,
    bookingSelection: t.bookingSelection,
    attributeSchema: t.attributeSchema.filter((f) => f.filterable),
    searchConfig: t.searchConfig,
  };
}

/**
 * One `mode_config` price → bigint VND đồng, or null if it isn't a usable amount.
 *
 * Accepts BOTH shapes a real row can hold: the contract's digit STRING (anything
 * written through the API — parsed with `BigInt`, never `Number()`, which loses
 * precision past 2^53) and a plain integer (`prisma/seed.ts` writes
 * `basePrice: 300_000` straight to the jsonb, bypassing the contract).
 *
 * This used to accept `typeof === 'number'` only, so every listing created
 * through the API — i.e. every real one — reported `priceFrom: null` and the
 * storefront card showed no "from" price at all.
 */
function toVnd(raw: unknown): bigint | null {
  if (typeof raw === 'string') return /^\d+$/.test(raw) ? BigInt(raw) : null;
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  return null;
}

/** Best-effort lowest configured price across booking modes (VND đồng digit string). */
function priceFrom(
  modeConfig: Record<string, unknown>,
  bookingSelection: 'flexible_duration' | 'fixed_packages',
): string | null {
  const prices: bigint[] = [];
  for (const cfg of Object.values(modeConfig)) {
    if (cfg && typeof cfg === 'object') {
      const c = cfg as Record<string, unknown>;
      if (bookingSelection === 'fixed_packages') {
        const packages = Array.isArray(c.packages) ? c.packages : [];
        for (const item of packages) {
          if (!item || typeof item !== 'object') continue;
          const row = item as Record<string, unknown>;
          if (row.isActive !== true) continue;
          const price = toVnd(row.price);
          if (price !== null && price > 0n) prices.push(price);
        }
        continue;
      }
      for (const key of ['basePrice', 'basePricePerNight']) {
        const price = toVnd(c[key]);
        if (price !== null && price > 0n) prices.push(price);
      }
    }
  }
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => (b < a ? b : a)).toString();
}

export function toPublicListingResponse(l: PublicListingRecord): PublicListingResponse {
  return {
    id: l.group?.id ?? l.id,
    kind: l.group ? 'group' : 'listing',
    title: l.group?.title ?? l.title,
    slug: l.group?.slug ?? l.slug,
    listingTypeSlug: l.listingTypeSlug,
    attributes: l.attributes,
    photos: l.group?.photos ?? l.photos,
    priceFrom: priceFrom(l.modeConfig, l.bookingSelection),
    itemLabel: l.group?.itemLabel ?? null,
    ratingAvg: l.group?.ratingAvg ?? l.ratingAvg,
    reviewCount: l.group?.reviewCount ?? l.reviewCount,
    provinceCode: l.group?.provinceCode ?? l.provinceCode,
    provinceName: l.group?.provinceName ?? l.provinceName,
    wardCode: l.group?.wardCode ?? l.wardCode,
    wardName: l.group?.wardName ?? l.wardName,
    address: l.group?.address ?? l.address,
  };
}
