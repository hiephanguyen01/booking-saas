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
    attributeSchema: t.attributeSchema,
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    requiresIdentityVerification: t.requiresIdentityVerification,
    structure: t.structure,
    itemLabel: t.itemLabel,
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
    attributeSchema: t.attributeSchema.filter((f) => f.filterable),
  };
}

/** Best-effort lowest configured price across booking modes (VND đồng digit string). */
function priceFrom(modeConfig: Record<string, unknown>): string | null {
  const prices: number[] = [];
  for (const cfg of Object.values(modeConfig)) {
    if (cfg && typeof cfg === 'object') {
      const c = cfg as Record<string, unknown>;
      for (const key of ['basePrice', 'basePricePerNight']) {
        if (typeof c[key] === 'number') prices.push(c[key] as number);
      }
    }
  }
  return prices.length > 0 ? String(Math.min(...prices)) : null;
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
    priceFrom: priceFrom(l.modeConfig),
    itemLabel: l.group?.itemLabel ?? null,
  };
}
