import type { ListingRevisionResponse } from '@booking/contracts';

/**
 * Overlay a parked edit onto the live record so the edit form opens on the
 * partner's own last version rather than the approved one — otherwise saving
 * again would silently revert their waiting change.
 *
 * The revision travels as a diff (only what changed), which is exactly what the
 * form needs: every `after` value keyed by its field name.
 */
export function applyRevisionDiff<T extends object>(
  record: T,
  revision: ListingRevisionResponse | null,
): T {
  if (!revision) return record;
  const merged: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const entry of revision.diff) {
    merged[entry.field] = entry.after;
  }
  return merged as T;
}
