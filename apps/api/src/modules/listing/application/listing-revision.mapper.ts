import type { ListingRevisionResponse } from '@booking/contracts';
import type { ListingGroupRecord } from '../domain/ports/listing-group-repository.port';
import type { ListingRecord } from '../domain/ports/listing-repository.port';
import type { ListingRevisionRecord } from '../domain/ports/listing-revision-repository.port';
import {
  buildListingGroupRevisionDiff,
  buildListingRevisionDiff,
} from '../domain/revisions/revision-diff';

/**
 * A parked edit as the dashboards read it: the stored payload never crosses the
 * wire raw — it is reduced to the fields that actually differ from the live
 * record, which is all a reviewer or the "changes pending" banner needs.
 */
export function toListingRevisionResponse(
  revision: ListingRevisionRecord,
  live: ListingRecord,
): ListingRevisionResponse {
  return {
    id: revision.id,
    targetType: revision.targetType,
    targetId: revision.targetId,
    targetTitle: live.title,
    status: revision.status,
    submittedAt: revision.submittedAt.toISOString(),
    reviewedAt: revision.reviewedAt?.toISOString() ?? null,
    reviewNote: revision.reviewNote,
    appliedAt: revision.appliedAt?.toISOString() ?? null,
    diff: buildListingRevisionDiff(live as unknown as Record<string, unknown>, revision.payload),
  };
}

export function toListingGroupRevisionResponse(
  revision: ListingRevisionRecord,
  live: ListingGroupRecord,
): ListingRevisionResponse {
  return {
    id: revision.id,
    targetType: revision.targetType,
    targetId: revision.targetId,
    targetTitle: live.title,
    status: revision.status,
    submittedAt: revision.submittedAt.toISOString(),
    reviewedAt: revision.reviewedAt?.toISOString() ?? null,
    reviewNote: revision.reviewNote,
    appliedAt: revision.appliedAt?.toISOString() ?? null,
    diff: buildListingGroupRevisionDiff(
      live as unknown as Record<string, unknown>,
      revision.payload,
    ),
  };
}
