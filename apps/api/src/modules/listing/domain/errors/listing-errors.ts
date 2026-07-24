import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Listing aggregate. Shared across the listing module's
 * sub-PRs (#11a/#11b/#11c) — named generically so cancellation-policy and
 * pricing-rule call-sites can reuse them. Codes + statuses + messages are
 * byte-identical to the pre-refactor use-case behaviour.
 */

export class ListingNotFound extends DomainError {
  constructor() {
    super('LISTING_NOT_FOUND', 404, 'Listing not found');
  }
}

export class ListingNotOwned extends DomainError {
  constructor() {
    super('LISTING_NOT_OWNED', 403, 'This listing belongs to another partner');
  }
}
