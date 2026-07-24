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

/**
 * Thrown when creating a group for a listing type whose `structure` is
 * `'standalone'` — that type only supports unbundled listings, not groups.
 */
export class ListingTypeNotGroupable extends DomainError {
  constructor() {
    super('LISTING_TYPE_NOT_GROUPABLE', 400, 'This listing type only supports standalone listings');
  }
}

/** Thrown by create/update when the requested slug is already taken by
 *  another listing group. */
export class ListingGroupSlugTaken extends DomainError {
  constructor(slug: string) {
    super('LISTING_GROUP_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

/** Thrown by delete when the group still has listings bound to it. */
export class ListingGroupNotEmpty extends DomainError {
  constructor(count: number) {
    super('LISTING_GROUP_NOT_EMPTY', 409, `Cannot delete a group with ${count} listing(s)`);
  }
}

/** Thrown by the submit cascade when a group has no listings to submit. */
export class ListingGroupEmpty extends DomainError {
  constructor() {
    super('LISTING_GROUP_EMPTY', 400, 'Add at least one listing before submitting the group');
  }
}

/**
 * The update/delete path's answer when the acting partner doesn't own the
 * group itself — same code as {@link ListingGroupNotOwned} (which is thrown
 * when binding a CHILD LISTING to someone else's group, message 'The listing
 * group belongs to another partner') but a DIFFERENT message: this one is the
 * group's OWN manage/delete guard. The two are NOT interchangeable.
 */
export class ListingGroupNotOwnedForManage extends DomainError {
  constructor() {
    super('LISTING_GROUP_NOT_OWNED', 403, 'Listing group belongs to another partner');
  }
}

/**
 * The partner-scoped update path's answer when the group itself isn't
 * editable (status not in draft/archived) — same code as
 * {@link ListingGroupReadOnlyForEdit} / {@link ListingGroupReadOnlyForDelete}
 * (the child-listing binding gate, messages '...changing its items' /
 * '...deleting its items') but a THIRD, distinct message: this one is the
 * group's OWN edit gate. NOT interchangeable with either.
 */
export class ListingGroupReadOnlyForOwnEdit extends DomainError {
  constructor() {
    super('LISTING_GROUP_READ_ONLY', 409, 'Hide the listing group before editing it');
  }
}
