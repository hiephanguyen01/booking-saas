import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Availability aggregate (scheduling module). Codes +
 * statuses + messages are byte-identical to the pre-refactor use-case
 * behaviour. `ListingNotFound`/`ResourceNotFound` are NOT minted here — the
 * availability write-path reuses the listing module's own errors.
 */

/** The availability-rule write-path's answer when the calling partner doesn't
 *  own the listing — a distinct shape from listing's own not-owned errors
 *  (`ListingNotOwned`, `ListingNotOwnedForDelete`, `ListingNotOwnedForModeration`):
 *  same code family (`NOT_OWNED`) as {@link ListingNotOwnedForModeration} but a
 *  message without the leading "This"; NOT interchangeable with any of the
 *  three listing shapes. */
export class ListingNotOwnedForAvailability extends DomainError {
  constructor() {
    super('NOT_OWNED', 403, 'Listing belongs to another partner');
  }
}

/** The availability-rule write-path's answer when the calling partner doesn't
 *  own the resource — a distinct shape from listing's own not-owned errors
 *  (`ListingNotOwned`, `ListingNotOwnedForDelete`, `ListingNotOwnedForModeration`):
 *  same code family (`NOT_OWNED`) but a message without the leading "This";
 *  NOT interchangeable with any of the three listing shapes. */
export class ResourceNotOwnedForAvailability extends DomainError {
  constructor() {
    super('NOT_OWNED', 403, 'Resource belongs to another partner');
  }
}

export class AvailabilityExceptionNotFound extends DomainError {
  constructor() {
    super('EXCEPTION_NOT_FOUND', 404, 'Exception not found');
  }
}

/** Defensive depth — the zod contracts (`availability.ts`) are the real
 *  boundary; this is unreachable via HTTP, only guarding the aggregate
 *  against a rule shape (day-of-week / time range) that violates its own
 *  invariants if constructed directly in-process. */
export class InvalidAvailabilityRule extends DomainError {
  constructor(reason: string) {
    super('INVALID_AVAILABILITY_RULE', 400, `Invalid availability rule: ${reason}`);
  }
}

/** Defensive depth — the zod contracts (`availability.ts`) are the real
 *  boundary; this is unreachable via HTTP, only guarding the aggregate
 *  against an exception shape (date / time range) that violates its own
 *  invariants if constructed directly in-process. */
export class InvalidAvailabilityException extends DomainError {
  constructor(reason: string) {
    super('INVALID_AVAILABILITY_EXCEPTION', 400, `Invalid availability exception: ${reason}`);
  }
}
