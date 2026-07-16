import type {
  ContactFlag,
  ListingGroupReviewResponse,
  ListingReviewResponse,
} from '@booking/contracts';
import type { ListingGroupRecord } from '../../domain/ports/listing-group-repository.port';
import type { ListingRecord } from '../../domain/ports/listing-repository.port';
import { photoScanFields, scanForContactInfo } from '../../domain/moderation/contact-scan';
import { buildReviewChecklist, checklistPassed } from '../../domain/moderation/review-checklist';
import { buildListingReview } from './build-listing-review';

/**
 * Build what a tenant reviewer sees for a **post** (listing_group) — the
 * group-level mirror of `buildListingReview` (§7.3).
 *
 * The load-bearing part: publishing a group publishes every child listing with
 * it, so this scans the CHILDREN's text as well as the group's own. Scanning only
 * the group would leave a hole straight through the anti-disintermediation gate
 * that the per-listing path enforces — a partner could park a phone number in a
 * child's description and have it published untouched.
 *
 * A child's flags are namespaced (`listings[0].description`) so the reviewer can
 * find the offending item; `groupContactFlags` is what the publish gate blocks on.
 */
export function groupContactFlags(
  group: Pick<ListingGroupRecord, 'title' | 'description' | 'photos'>,
  children: readonly Pick<ListingRecord, 'title' | 'description' | 'photos'>[],
): ContactFlag[] {
  const own = scanForContactInfo({
    title: group.title,
    description: group.description,
    ...photoScanFields(group.photos),
  });
  const inherited = children.flatMap((child, index) =>
    scanForContactInfo({
      title: child.title,
      description: child.description,
      ...photoScanFields(child.photos),
    }).map((flag) => ({ ...flag, field: `listings[${index}].${flag.field}` })),
  );
  return [...own, ...inherited];
}

/** Whether every child passed one named row of its own listing checklist. */
function everyChildPasses(reviews: readonly ListingReviewResponse[], key: string): boolean {
  return reviews.every((r) => r.checklist.find((i) => i.key === key)?.passed === true);
}

/**
 * A post's checklist, row-for-row with a listing's so the two read alike.
 *
 * `photos`/`description` are checked on the post itself — it is the
 * storefront-facing unit. `price`/`cancellation_policy` live on the items, so
 * those rows pass only when EVERY item passes the same row of its own checklist.
 * An empty post never passes: there is nothing to book.
 */
export function buildListingGroupReview(
  group: ListingGroupRecord,
  children: readonly ListingRecord[],
): ListingGroupReviewResponse {
  const listings = children.map(buildListingReview);
  const checklist = buildReviewChecklist({
    photoCount: group.photos.length,
    hasDescription: Boolean(group.description && group.description.trim().length > 0),
    hasPricePerMode: listings.length > 0 && everyChildPasses(listings, 'price'),
    hasCancellationPolicy: listings.length > 0 && everyChildPasses(listings, 'cancellation_policy'),
  });
  return {
    groupId: group.id,
    status: group.status,
    checklist,
    checklistPassed: checklistPassed(checklist) && listings.length > 0,
    contactFlags: groupContactFlags(group, children),
    listings,
  };
}
