import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Errors of the parked-edit path (§7.3). A revision is only ever decided once, so
 * both the reviewer's approve/reject and the partner's discard fail loudly rather
 * than silently re-deciding a settled change.
 */

export class ListingRevisionNotFound extends DomainError {
  constructor() {
    super('LISTING_REVISION_NOT_FOUND', 404, 'No pending change found for this listing');
  }
}

/** Lost race: another reviewer (or the partner) already settled this revision. */
export class ListingRevisionAlreadyDecided extends DomainError {
  constructor() {
    super('LISTING_REVISION_ALREADY_DECIDED', 409, 'This change has already been handled');
  }
}

/**
 * Re-publishing must not smuggle unreviewed content back onto the storefront:
 * while an edit is waiting, the partner either waits for the decision or discards
 * the change.
 */
export class ListingHasPendingRevision extends DomainError {
  constructor() {
    super(
      'LISTING_HAS_PENDING_REVISION',
      409,
      'This listing has a change awaiting review — wait for the decision or discard it before re-publishing',
    );
  }
}
