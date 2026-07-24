import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors thrown BY the Listing aggregate/use-cases when binding a
 * listing to a listing group (create/update/delete). Named generically so
 * #11c (ListingGroup aggregate) can reuse them. Codes + statuses + messages
 * are byte-identical to the pre-refactor use-case behaviour.
 */

export class ListingGroupNotFound extends DomainError {
  constructor() {
    super('LISTING_GROUP_NOT_FOUND', 404, 'Listing group not found');
  }
}

export class ListingGroupNotOwned extends DomainError {
  constructor() {
    super('LISTING_GROUP_NOT_OWNED', 403, 'The listing group belongs to another partner');
  }
}

export class ListingGroupTypeMismatch extends DomainError {
  constructor() {
    super(
      'LISTING_GROUP_TYPE_MISMATCH',
      400,
      'The listing and its group must use the same listing type',
    );
  }
}

/** The create/update path's answer when the bound group isn't a draft — same
 *  code as {@link ListingGroupReadOnlyForDelete} but a different message (this
 *  one explains changing items, that one explains deleting them); the two are
 *  NOT interchangeable. */
export class ListingGroupReadOnlyForEdit extends DomainError {
  constructor() {
    super('LISTING_GROUP_READ_ONLY', 409, 'Hide the listing group before changing its items');
  }
}

/** The partner-scoped delete path's answer when the bound group isn't a draft
 *  — same code as {@link ListingGroupReadOnlyForEdit} but a different message
 *  (this one explains deleting items, that one explains changing them); the
 *  two are NOT interchangeable. */
export class ListingGroupReadOnlyForDelete extends DomainError {
  constructor() {
    super('LISTING_GROUP_READ_ONLY', 409, 'Hide the listing group before deleting its items');
  }
}
