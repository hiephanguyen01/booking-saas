import type { RevisionDiffEntry, RevisionDiffSection } from '@booking/contracts';

/**
 * What actually changed between the live record and a parked edit (§7.3). Pure:
 * the caller supplies both sides, and only fields present in the payload are
 * considered — an update input is a patch, so an absent key means "unchanged",
 * never "clear it".
 *
 * Sections mirror the partner's edit form, so a reviewer reads the diff in the
 * same order the partner filled it in.
 */

const LISTING_FIELD_SECTION: Record<string, RevisionDiffSection> = {
  title: 'content',
  description: 'content',
  photos: 'content',
  categoryId: 'content',

  provinceCode: 'location',
  wardCode: 'location',
  address: 'location',
  latitude: 'location',
  longitude: 'location',

  attributes: 'pricing',
  bookingModes: 'pricing',
  modeConfig: 'pricing',
  stockQuantity: 'pricing',

  capacity: 'policy',
  bufferBefore: 'policy',
  bufferAfter: 'policy',
  approvalRequired: 'policy',
  depositPercent: 'policy',
  balanceDue: 'policy',
  cancellationPolicyId: 'policy',
};

const GROUP_FIELD_SECTION: Record<string, RevisionDiffSection> = {
  title: 'content',
  description: 'content',
  photos: 'content',
  amenities: 'content',

  provinceCode: 'location',
  wardCode: 'location',
  address: 'location',
  latitude: 'location',
  longitude: 'location',
  workingArea: 'location',
};

/**
 * Structural equality over the JSON-ish values these fields hold. Key order is
 * irrelevant for objects (`attributes`, `modeConfig`), while array order IS
 * significant — reordering photos or packages is a real change a reviewer should
 * see.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!sameValue(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function buildDiff(
  live: Record<string, unknown>,
  payload: Record<string, unknown>,
  sections: Record<string, RevisionDiffSection>,
): RevisionDiffEntry[] {
  const entries: RevisionDiffEntry[] = [];
  for (const [field, section] of Object.entries(sections)) {
    if (!(field in payload)) continue;
    const before = live[field] ?? null;
    const after = payload[field] ?? null;
    if (sameValue(before, after)) continue;
    entries.push({ field, section, before, after });
  }
  return entries;
}

export function buildListingRevisionDiff(
  live: Record<string, unknown>,
  payload: Record<string, unknown>,
): RevisionDiffEntry[] {
  return buildDiff(live, payload, LISTING_FIELD_SECTION);
}

export function buildListingGroupRevisionDiff(
  live: Record<string, unknown>,
  payload: Record<string, unknown>,
): RevisionDiffEntry[] {
  return buildDiff(live, payload, GROUP_FIELD_SECTION);
}

/**
 * The live values overlaid with a parked edit — what the listing WOULD look like
 * if approved. The review checklist and the contact-info scan run on this, so an
 * edit made after publication is screened exactly like a first submission.
 */
export function mergeRevisionPayload<T extends object>(
  live: T,
  payload: Record<string, unknown>,
  fields: readonly string[],
): T {
  const merged: Record<string, unknown> = { ...(live as Record<string, unknown>) };
  for (const field of fields) {
    if (field in payload) merged[field] = payload[field];
  }
  return merged as T;
}

/** Fields of a listing whose content the review gate inspects. */
export const LISTING_REVIEWED_FIELDS = [
  'title',
  'description',
  'photos',
  'bookingModes',
  'modeConfig',
  'cancellationPolicyId',
] as const;

/** Group-level counterpart of {@link LISTING_REVIEWED_FIELDS}. */
export const LISTING_GROUP_REVIEWED_FIELDS = [
  'title',
  'description',
  'photos',
  'amenities',
] as const;
