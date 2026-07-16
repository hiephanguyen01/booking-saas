import type { BookingMode, ListingReviewResponse } from '@booking/contracts';
import type { ListingRecord } from '../../domain/ports/listing-repository.port';
import { toVnd } from '../../domain/group-stats';
import { photoScanFields, scanForContactInfo } from '../../domain/moderation/contact-scan';
import { buildReviewChecklist, checklistPassed } from '../../domain/moderation/review-checklist';

/** `toVnd` handles both wire shapes and never `Number()`s a VND string (§7.3). */
function modeHasPrice(mode: BookingMode, modeConfig: Record<string, unknown>): boolean {
  const cfg = modeConfig[mode];
  if (!cfg || typeof cfg !== 'object') return false;
  const priceKey = mode === 'daily' ? 'basePricePerNight' : 'basePrice';
  const price = toVnd((cfg as Record<string, unknown>)[priceKey]);
  return price !== null && price > 0n;
}

/**
 * Build what a tenant reviewer sees for a listing: the submission checklist plus
 * any contact-info leakage (§7.3). Pure — the use case supplies the record.
 */
export function buildListingReview(listing: ListingRecord): ListingReviewResponse {
  const checklist = buildReviewChecklist({
    photoCount: listing.photos.length,
    hasDescription: Boolean(listing.description && listing.description.trim().length > 0),
    hasPricePerMode:
      listing.bookingModes.length > 0 &&
      listing.bookingModes.every((m) => modeHasPrice(m, listing.modeConfig)),
    hasCancellationPolicy: listing.cancellationPolicyId !== null,
  });
  const contactFlags = scanForContactInfo({
    title: listing.title,
    description: listing.description,
    ...photoScanFields(listing.photos),
  });
  return {
    listingId: listing.id,
    status: listing.status,
    checklist,
    checklistPassed: checklistPassed(checklist),
    contactFlags,
  };
}
