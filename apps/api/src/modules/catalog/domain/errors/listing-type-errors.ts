import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the ListingType aggregate. Every code + status + message is
 * byte-identical to the pre-refactor use-case / search-config-validator behaviour
 * (wire frozen) — these messages are user-visible text, and the envelope shape
 * is frozen by the refactor's wire-freeze rule.
 */

export class ListingTypeSlugTaken extends DomainError {
  constructor(slug: string) {
    super('LISTING_TYPE_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

export class InvalidDefaultModes extends DomainError {
  constructor(invalid: string[]) {
    super(
      'INVALID_DEFAULT_MODES',
      400,
      `defaultModes must be a subset of allowedModes; invalid: ${invalid.join(', ')}`,
    );
  }
}

export class InvalidFixedPackageModes extends DomainError {
  constructor() {
    super(
      'INVALID_FIXED_PACKAGE_MODES',
      400,
      'Fixed packages only support hourly and daily booking modes',
    );
  }
}

/** The type's booking selection is frozen while listings already use it. */
export class BookingSelectionLocked extends DomainError {
  constructor() {
    super(
      'BOOKING_SELECTION_LOCKED',
      409,
      'Booking selection cannot change while listings use this type',
    );
  }
}

export class ListingTypeInUse extends DomainError {
  constructor(inUse: number) {
    super(
      'LISTING_TYPE_IN_USE',
      409,
      `Cannot delete a listing type with ${inUse} listing(s); deactivate it instead`,
    );
  }
}

export class InvalidSearchSchedule extends DomainError {
  constructor(schedule: string) {
    super(
      'INVALID_SEARCH_SCHEDULE',
      400,
      `Search schedule "${schedule}" must be enabled by allowedModes`,
    );
  }
}

/**
 * Three distinct facet rules share this code today; the caller passes the exact
 * message so the wire stays identical for each of them.
 */
export class InvalidSearchFacet extends DomainError {
  constructor(message: string) {
    super('INVALID_SEARCH_FACET', 400, message);
  }
}

export class InvalidSearchBuckets extends DomainError {
  constructor(leftId: string, rightId: string, facetKey: string) {
    super(
      'INVALID_SEARCH_BUCKETS',
      400,
      `Buckets "${leftId}" and "${rightId}" overlap in facet "${facetKey}"`,
    );
  }
}
